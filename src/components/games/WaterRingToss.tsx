import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import Svg, {
    Circle,
    Defs,
    Ellipse,
    G,
    LinearGradient,
    Path,
    RadialGradient,
    Rect,
    Stop,
} from 'react-native-svg';
import InnerScreen from '../chrome/InnerScreen';
import { colors } from '../../styles/tokens';

interface WaterRingTossProps {
    onBack: () => void;
    onGameEnd?: (won: boolean) => void;
}

type GameStatus = 'playing' | 'won';
type JetSide = 'left' | 'center' | 'right';

interface RingState {
    id: number;
    color: string;
    // Normalized [0..1] tank-local coords. (0,0) = top-left of water region.
    x: number;
    y: number;
    vx: number;
    vy: number;
    // Visual rotation (radians) + spin rate so off-center pulses can flip
    // rings end-over-end the way the real arcade physics does.
    rot: number;
    spin: number;
    hooked: number | null;
    slot: number;
    // Settle progress so a caught ring eases into its slot instead of
    // teleporting on capture.
    settle: number;
    // True between "ring touched the ceiling during a won-state dump"
    // and "ring touched the floor again". While true the catch logic
    // skips this ring so the inversion-reset doesn't immediately
    // re-hook rings on their way back down. Cleared on floor contact.
    dumped: boolean;
}

interface PegTarget {
    // All [0..1] tank-local. Pegs face UP from a base in the middle of
    // the tank, like the real arcade game — rings have to fall DOWN onto
    // the peg's tip and slide down the shaft to be hooked.
    x: number;
    baseY: number;
    height: number;
}

interface Pulse {
    id: number;
    side: JetSide;
    startedAt: number;
}

// Tank uses a portrait viewBox so hooks have headroom. Physics math runs in
// normalized [0..1] coords; SVG scales to whatever the InnerScreen cavity is.
const VIEWBOX_WIDTH = 320;
const VIEWBOX_HEIGHT = 500;
const RING_COUNT = 8;
const RING_RADIUS = 11;
// Effective catch radius — represents the ring's INNER hole rather
// than its outer edge, so a hook only fires when the peg shaft would
// pass through the donut's hole, not just graze the meat. Smaller
// than RING_RADIUS by design.
const RING_HOLE_RADIUS = 7.5;

// Three jets across the bottom — left/center/right map 1:1 to the casing
// buttons. Each pulse is a discrete impulse with a short decay tail; rapid
// presses STACK so mashing a button shoots rings higher than a single tap.
const JET_X: Record<JetSide, number> = { left: 0.22, center: 0.5, right: 0.78 };
const PULSE_DURATION_MS = 360;
// Five pegs sit close to the bottom of the tank, like in the actual
// arcade game — bases just above the resting ring layer, tips poking
// up into mid-tank where rings have to be lifted to drop on them.
// Outer pegs are short, center is tallest. Each holds two rings.
const PEGS: PegTarget[] = [
    { x: 0.18, baseY: 0.78, height: 0.16 },
    { x: 0.34, baseY: 0.74, height: 0.22 },
    { x: 0.50, baseY: 0.70, height: 0.28 },
    { x: 0.66, baseY: 0.74, height: 0.22 },
    { x: 0.82, baseY: 0.78, height: 0.16 },
];
// A ring is captured when its center sits inside the peg's vertical
// "capture column" while descending. The horizontal threshold is the
// ring's HOLE radius — peg shaft must visibly pass through the donut's
// hole, not just graze the meat.
const PEG_CATCH_RADIUS_X = RING_HOLE_RADIUS / VIEWBOX_WIDTH;
// Vertical spacing between ring slots on a single peg. Tighter than
// the original 0.028 so stacked rings nest visually into each other
// instead of leaving a visible gap. The collision clamp inside the
// hooked-ring branch enforces this distance as a HARD floor so a
// pulsed-up lower slot ring cannot pass through the slot above it.
const STACK_SPACING = 0.022;
// Pulse force applied to a HOOKED ring. 1.0 = same magnitude as a
// free-ring tail, so directly-targeted stacked pulses CAN lift a ring
// off the peg in a couple beats. This replaces the binary "blow-off"
// with continuous slip physics.
const HOOKED_PULSE_GAIN = 1.0;
// Instant kick applied to hooked rings on each button press, scaled
// by reach to peg.x. Smaller than the free-ring kick so a single tap
// just bobs them, but mashing accumulates.
const HOOKED_KICK = 0.2;
const RING_COLORS = [
    '#F4D35E',
    '#EE964B',
    '#F95738',
    '#5BC0EB',
    '#9BC53D',
    '#C77DFF',
    '#F15BB5',
    '#2EC4B6',
];

// Tilt-to-bias gravity strength (in g-units). Even a fully sideways phone
// only contributes this much — the rule is "tilt nudges, doesn't replace".
const TILT_GRAVITY_MAX = 0.32;
// Smoothing factor for accelerometer x-axis reads. Low values = more lag
// but less jitter; this strikes a middle ground.
const TILT_SMOOTH = 0.18;

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

// Spread rings into vertical lanes so they don't spawn stacked. They rest
// near the tank floor and rise only when the player pumps water at them.
const createRings = (): RingState[] => {
    const lanes = RING_COUNT;
    return Array.from({ length: RING_COUNT }, (_, index) => {
        const lane = (index + 0.5) / lanes;
        return {
            id: index,
            color: RING_COLORS[index % RING_COLORS.length],
            x: clamp(lane + (Math.random() - 0.5) * 0.04, 0.1, 0.9),
            y: 0.84 + Math.random() * 0.08,
            vx: 0,
            vy: 0,
            rot: Math.random() * Math.PI * 2,
            spin: 0,
            hooked: null,
            slot: 0,
            settle: 0,
            dumped: false,
        };
    });
};

const summarizeHookCounts = (rings: RingState[]) =>
    PEGS.map((_, pegIndex) =>
        rings.filter((ring) => ring.hooked === pegIndex).length,
    );

// Pulse strength curve — full at t=0, linearly decays to zero at the end of
// the pulse window. Multiple overlapping pulses on the same side sum.
const pulseStrength = (pulse: Pulse, now: number): number => {
    const elapsed = now - pulse.startedAt;
    if (elapsed < 0 || elapsed > PULSE_DURATION_MS) return 0;
    const t = elapsed / PULSE_DURATION_MS;
    return 1 - t;
};

// Horizontal proximity falloff for a jet column. Returns [0..1] where 1 is
// directly above the nozzle and 0 is outside its reach.
const jetReach = (jetX: number, ringX: number) => {
    const reach = 0.18;
    return Math.max(0, 1 - Math.abs(ringX - jetX) / reach);
};

const WaterRingToss: React.FC<WaterRingTossProps> = ({ onBack, onGameEnd }) => {
    const [rings, setRings] = useState<RingState[]>(() => createRings());
    const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
    const [jetIntensity, setJetIntensity] = useState<Record<JetSide, number>>({
        left: 0,
        center: 0,
        right: 0,
    });

    const ringsRef = useRef(rings);
    const statusRef = useRef<GameStatus>(gameStatus);
    const endedRef = useRef(false);
    const pulsesRef = useRef<Pulse[]>([]);
    const pulseIdRef = useRef(0);
    // Smoothed accelerometer reads. tiltRef is the x-axis (left/right
    // tilt) used to bias horizontal gravity. tiltYRef tracks how
    // upright the phone is — +1 when held normally, -1 when fully
    // flipped upside-down — and is used to scale VERTICAL gravity.
    // Flipping the phone therefore reverses gravity in the tank as a
    // visual gag: hooked rings rise up the shaft and slip off the
    // tip, free rings float to what is now the bottom (top of the
    // screen), and righting the phone restores normal gravity so they
    // fall back down. Starts at 1 so frame 0 has correct gravity
    // before the sensor's first read lands.
    const tiltRef = useRef(0);
    const tiltYRef = useRef(1);
    const onGameEndRef = useRef(onGameEnd);

    useEffect(() => {
        onGameEndRef.current = onGameEnd;
    }, [onGameEnd]);

    useEffect(() => {
        ringsRef.current = rings;
    }, [rings]);

    useEffect(() => {
        statusRef.current = gameStatus;
    }, [gameStatus]);

    // Accelerometer subscription — x-axis is left/right tilt in portrait. We
    // smooth with EMA and write to a ref so physics can read without
    // triggering re-renders. Y/Z are intentionally ignored: the rule is
    // "tilt nudges horizontal gravity, never inverts vertical gravity",
    // so flipping the phone face-down has no effect.
    useEffect(() => {
        let mounted = true;
        let subscription: { remove: () => void } | null = null;
        Accelerometer.setUpdateInterval(60);
        Accelerometer.isAvailableAsync().then((available) => {
            if (!mounted || !available) return;
            subscription = Accelerometer.addListener(({ x, y }) => {
                // X — horizontal tilt that biases gravity. Negated
                // because expo-sensors reports x with the opposite
                // sign on this device (tilting the right edge down
                // produces a NEGATIVE x read instead of positive).
                const rawX = clamp(-x, -1, 1);
                tiltRef.current =
                    tiltRef.current * (1 - TILT_SMOOTH) + rawX * TILT_SMOOTH;
                // Y — uprightness, scales vertical gravity. +1 when
                // the phone is normal, -1 when flipped over. Read as-
                // is on the standard Android convention; if upright
                // ever reports negative on a particular device, flip
                // this sign and the rest of physics keeps working.
                const rawY = clamp(y, -1, 1);
                tiltYRef.current =
                    tiltYRef.current * (1 - TILT_SMOOTH) + rawY * TILT_SMOOTH;
            });
        });
        return () => {
            mounted = false;
            subscription?.remove();
        };
    }, []);

    const hookedCount = useMemo(
        () => rings.filter((ring) => ring.hooked !== null).length,
        [rings],
    );

    const finishRound = useCallback(() => {
        if (endedRef.current) return;
        endedRef.current = true;
        setGameStatus('won');
        statusRef.current = 'won';
        pulsesRef.current = [];
        setJetIntensity({ left: 0, center: 0, right: 0 });
        onGameEndRef.current?.(true);
    }, []);

    const startRound = useCallback(() => {
        const nextRings = createRings();
        ringsRef.current = nextRings;
        statusRef.current = 'playing';
        endedRef.current = false;
        pulsesRef.current = [];
        setRings(nextRings);
        setGameStatus('playing');
        setJetIntensity({ left: 0, center: 0, right: 0 });
    }, []);

    // Fire a single pulse on the given side. Each press = one pulse; rapid
    // mashing stacks them so a triple-tap launches a ring much higher than
    // a single press — that's the core of the gameplay.
    const firePulse = useCallback((side: JetSide) => {
        if (statusRef.current !== 'playing') return;
        const now = Date.now();
        // Apply an instant velocity kick to in-range rings so the pulse
        // feels responsive, not delayed-by-physics. The decay tail then
        // continues to nudge them up for ~360ms.
        const previous = ringsRef.current;
        let touched = false;
        const next = previous.map((ring) => {
            if (ring.hooked !== null) {
                // Hooked rings get a SMALLER instant kick, scaled by how
                // close the firing jet is to the peg. Mashing the same
                // button under a peg can lift the ring off — that's how
                // overpump punishes you for being aggressive. Per-ring
                // jitter so two rings stacked on the same peg don't bob
                // in lockstep.
                const peg = PEGS[ring.hooked];
                const reach = jetReach(JET_X[side], peg.x);
                if (reach <= 0) return ring;
                touched = true;
                const kickJitter = 0.7 + Math.random() * 0.6;
                return {
                    ...ring,
                    vy: ring.vy - HOOKED_KICK * reach * kickJitter,
                };
            }
            const reach = jetReach(JET_X[side], ring.x);
            if (reach <= 0) return ring;
            touched = true;
            // Per-ring random factors so overlapping rings don't share
            // a trajectory — real turbulent water has eddies, this is
            // the cheap stand-in. Lift varies ±15%, lateral nudge
            // shoves stuck pairs apart, spin scale adds flutter so
            // they don't pinwheel in unison either.
            const liftJitter = 0.85 + Math.random() * 0.3;
            const lateralNudge = (Math.random() - 0.5) * reach * 0.18;
            const spinJitter = 0.6 + Math.random() * 0.8;
            // Vertical kick scales with proximity — a button-aligned ring
            // gets the full impulse, a cousin in the next column gets a
            // weaker assist. Pulse strength was tuned down so a single
            // tap won't fly a ring all the way to the center peg —
            // stacking pulses is the whole skill curve.
            const lift = -0.5 * reach * liftJitter;
            // Off-center pulses torque the ring (spin += sign * strength).
            // Sign: jet to the LEFT of the ring spins it clockwise (positive
            // spin in our convention), jet to the right spins CCW.
            const offset = ring.x - JET_X[side];
            const spinKick = clamp(offset * reach * 9 * spinJitter, -5, 5);
            // Entrainment: a rising water column drags nearby fluid
            // INTO it (Bernoulli / Venturi). So a ring beside the jet
            // gets pulled toward the column as it rises, not just
            // shoved straight up. Direction is (jetX - ring.x), so a
            // ring on either side gets sucked inward toward THIS jet.
            // The lateral nudge layers on top to break ties between
            // co-located rings.
            const currentPull = (JET_X[side] - ring.x) * reach * 1.4;
            return {
                ...ring,
                vy: ring.vy + lift,
                vx: ring.vx + currentPull + lateralNudge,
                spin: ring.spin + spinKick,
            };
        });
        if (touched) {
            ringsRef.current = next;
            setRings(next);
        }
        pulsesRef.current.push({
            id: pulseIdRef.current++,
            side,
            startedAt: now,
        });
        // Trim very old pulses so the array doesn't grow unbounded under
        // heavy mashing.
        if (pulsesRef.current.length > 24) {
            pulsesRef.current = pulsesRef.current.filter(
                (p) => now - p.startedAt < PULSE_DURATION_MS,
            );
        }
    }, []);

    const stepPhysics = useCallback((dt: number, now: number) => {
        // Sum active pulses per side. The total per-side strength may exceed
        // 1.0 when multiple pulses overlap — that's the "stacking" the
        // player feels when they mash a button.
        let leftStrength = 0;
        let centerStrength = 0;
        let rightStrength = 0;
        const livePulses: Pulse[] = [];
        for (const pulse of pulsesRef.current) {
            const s = pulseStrength(pulse, now);
            if (s <= 0) continue;
            livePulses.push(pulse);
            if (pulse.side === 'left') leftStrength += s;
            else if (pulse.side === 'center') centerStrength += s;
            else rightStrength += s;
        }
        pulsesRef.current = livePulses;

        // Tilt → horizontal gravity bias. tiltRef is in g-units and already
        // clamped+smoothed; multiply by max bias and apply as +/- gx.
        const tiltGx = tiltRef.current * TILT_GRAVITY_MAX;

        const previous = ringsRef.current;
        const hookCounts = summarizeHookCounts(previous);
        // Snapshot of each occupied slot's previous-frame y, indexed
        // by peg then slot. The hooked-ring branch reads this so a
        // ring at slot N can clamp against the ring at slot N+1
        // (preventing the lower stack member from rising through the
        // upper one when both get a pulse). One-frame lag is fine
        // for visual purposes — the rings only move ~0.01 normalized
        // units per frame at typical speeds.
        const pegSlotY: (number | undefined)[][] = PEGS.map(() => []);
        for (const r of previous) {
            if (r.hooked !== null) {
                pegSlotY[r.hooked][r.slot] = r.y;
            }
        }
        let caughtThisFrame = false;

        const next = previous.map((ring) => {
            // Hooked ring is a LOOSE physics object on a stick. Gravity
            // pulls it down toward its slot's rest position; pulses lift
            // it back up; if a strong enough pulse pushes it past the
            // peg's tip, the peg slips out of the hole and the ring
            // unhooks. No binary "blow-off" check — it falls out of
            // the physics naturally.
            if (ring.hooked !== null) {
                const peg = PEGS[ring.hooked];
                const tipY = peg.baseY - peg.height;
                // Slot 0 rests just above base; slot 1 stacks tight on top
                // of slot 0. This is the FLOOR for the ring on this peg
                // — it can't sink lower, but it can rise up the shaft.
                const restY = peg.baseY - 0.022 - ring.slot * STACK_SPACING;
                // Position of the slot directly above this one, if
                // any. Used as a HARD ceiling — the lower slot can
                // approach but never pass through the upper slot's
                // ring. Read from the previous frame so per-ring
                // updates stay independent.
                const aboveY = pegSlotY[ring.hooked][ring.slot + 1];

                let { x, y, vx, vy, rot, spin } = ring;

                // Gravity along the shaft. During play it's a constant
                // pull toward the slot floor; only after a clear does it
                // become orientation-coupled, so flipping the phone in
                // the won state lets every ring rise up and slip off
                // the tip via the y < tipY unhook check below.
                const gravScale = statusRef.current === 'won' ? tiltYRef.current : 1;
                vy += 0.32 * gravScale * dt;

                // Pulses push hooked rings up, but at reduced strength so
                // a single tap just bobs them while a triple-tap can lift
                // a ring off the tip.
                const lift = (jetX: number, strength: number) => {
                    if (strength <= 0) return;
                    const reach = jetReach(jetX, peg.x);
                    if (reach <= 0) return;
                    vy -= 1.05 * reach * strength * HOOKED_PULSE_GAIN * dt;
                };
                lift(JET_X.left, leftStrength);
                lift(JET_X.center, centerStrength);
                lift(JET_X.right, rightStrength);

                // Drag — heavier on Y so the ring damps out instead of
                // oscillating wildly.
                vy *= Math.pow(0.5, dt);

                // Constrain X to peg shaft with a small live wobble that
                // grows under active pulses — looks like the ring is
                // jiggling in moving water rather than glued in place.
                const wobblePhase = now / 380 + ring.id * 0.7;
                const wobbleAmp =
                    0.0035 +
                    (leftStrength + centerStrength + rightStrength) * 0.0035;
                x = peg.x + Math.sin(wobblePhase) * wobbleAmp;
                vx = 0;

                y += vy * dt;

                // Slipped past the tip → unhook. No artificial boost
                // or scatter — the ring carries exactly the velocity
                // it had the frame it crossed the tip, so a heavy
                // overpump arcs high while a marginal one barely
                // clears and drops back. The previous Math.min(vy,
                // -0.18) clamp + random vx/spin nudges read as a
                // free shove and are gone.
                if (y < tipY) {
                    return {
                        ...ring,
                        hooked: null,
                        slot: 0,
                        settle: 0,
                        x,
                        y,
                        vx,
                        vy,
                        spin,
                    };
                }

                // Bottom clamp — the ring rests at restY. vy zeroed at the
                // floor so gravity doesn't keep accumulating into a sudden
                // pop the next time a pulse fires.
                if (y > restY) {
                    y = restY;
                    if (vy > 0) vy = 0;
                }

                // Upper-neighbor clamp — a lower-slot ring cannot
                // pass through the slot above it. The minimum y for
                // this ring is the upper ring's y plus STACK_SPACING
                // (centers separated by exactly the stack pitch).
                // Zeroing vy on contact keeps a strong pulse from
                // pushing the lower ring's velocity through the
                // upper one, even though its position is clamped.
                if (aboveY !== undefined && y < aboveY + STACK_SPACING) {
                    y = aboveY + STACK_SPACING;
                    if (vy < 0) vy = 0;
                }

                spin *= Math.pow(0.55, dt);
                rot += spin * dt;

                return { ...ring, x, y, vx, vy, rot, spin };
            }

            let { vx, vy, x, y, rot, spin } = ring;
            let dumped = ring.dumped;

            // Gravity is constant during play; only after the round is
            // won does it follow the phone's orientation, so inverting
            // the device flips gravity and dumps the rings back into
            // the water for a reset. The X tilt nudge stays live in
            // both states so the tank still feels responsive in hand.
            const gravScale = statusRef.current === 'won' ? tiltYRef.current : 1;
            vy += 0.32 * gravScale * dt;
            vx += tiltGx * dt;

            // Per-pulse force application. Each pulse contributes a
            // continuous lift+inward push for its decay window — the
            // initial velocity kick from firePulse handles the snap, and
            // this tail keeps a ring rising while the pulse is "live".
            const applyPulse = (jetX: number, strength: number) => {
                if (strength <= 0) return;
                const reach = jetReach(jetX, x);
                if (reach <= 0) return;
                const power = reach * strength;
                vy -= 0.55 * power * dt;
                // Entrainment: the rising column drags nearby water
                // INTO it, so the tail force pulls each ring toward
                // the firing jet's x — not toward x=0.5 like a generic
                // "drift to center". A ring sitting between two
                // adjacent jets gets pulled by whichever side is
                // firing harder.
                vx += (jetX - x) * power * 3.5 * dt;
                // Per-frame turbulence — small lateral jitter so two
                // rings sharing a column slowly drift apart over the
                // pulse's decay window instead of tracking. Magnitude
                // scales with power so it only matters during active
                // jets, not at rest.
                vx += (Math.random() - 0.5) * power * 0.25 * dt;
                spin += (x - jetX) * power * 2.5 * dt;
            };
            applyPulse(JET_X.left, leftStrength);
            applyPulse(JET_X.center, centerStrength);
            applyPulse(JET_X.right, rightStrength);

            // Water drag — viscous on Y so rings settle slowly under
            // buoyancy, lighter on X so lateral aim stays responsive.
            vx *= Math.pow(0.55, dt);
            vy *= Math.pow(0.38, dt);

            // Speed cap. A stack of pulses can yield enormous velocities
            // otherwise; cap so rings stay readable.
            const maxSpeed = 1.8;
            const speedSq = vx * vx + vy * vy;
            if (speedSq > maxSpeed * maxSpeed) {
                const s = maxSpeed / Math.sqrt(speedSq);
                vx *= s;
                vy *= s;
            }

            x += vx * dt;
            y += vy * dt;

            // Tank boundary bounces. Floor bounce is light so rings settle
            // to rest at the bottom rather than jiggling forever.
            if (x < 0.07) {
                x = 0.07;
                vx = Math.abs(vx) * 0.45;
                spin += vy * 2;
            } else if (x > 0.93) {
                x = 0.93;
                vx = -Math.abs(vx) * 0.45;
                spin -= vy * 2;
            }
            if (y < 0.04) {
                y = 0.04;
                vy = Math.abs(vy) * 0.5;
                // Mark this ring as "dumped" so it can't re-catch on
                // the way down. Only counts during the won-state
                // inversion gag — touching the ceiling mid-game
                // shouldn't disable catches.
                if (statusRef.current === 'won') dumped = true;
            } else if (y > 0.94) {
                y = 0.94;
                vy = -Math.abs(vy) * 0.25;
                // Floor friction settles spin. Clear the dump flag so
                // the ring is eligible for catches on the next round.
                spin *= 0.7;
                dumped = false;
            }

            // Spin damping — air-style spin that decays toward zero in
            // water. Faster decay than horizontal drag so rings don't
            // stay pinwheeling forever.
            spin *= Math.pow(0.45, dt);
            rot += spin * dt;

            // Catch detection — skipped entirely if this ring is
            // mid-dump (touched ceiling during the won-state reset).
            // A dumped ring stays catch-immune until it lands on the
            // floor, so the inversion gag can't immediately re-hook
            // rings on their way back down.
            if (!dumped) for (let pegIndex = 0; pegIndex < PEGS.length; pegIndex += 1) {
                const peg = PEGS[pegIndex];
                const tipY = peg.baseY - peg.height;
                const dx = x - peg.x;
                if (Math.abs(dx) > PEG_CATCH_RADIUS_X) continue;
                // Catch only at the threading moment: ring center
                // must be in a narrow band right at the tip, the
                // height of the ring's hole. Outside that band the
                // ring's outer edge has already moved past the top
                // magenta line, so it would visually catch "halfway
                // down the hook" — not what the player expects.
                const catchBand = (RING_HOLE_RADIUS * 2) / VIEWBOX_HEIGHT;
                if (y < tipY) continue;
                if (y > tipY + catchBand) continue;
                // Reject only meaningful upward motion. Hovering
                // (vy≈0) and any descent count as catchable; a
                // strong jet-driven ascent doesn't.
                if (vy < -0.05) continue;
                {
                    const slot = hookCounts[pegIndex];
                    hookCounts[pegIndex] += 1;
                    caughtThisFrame = true;
                    return {
                        ...ring,
                        x: peg.x,
                        y: Math.max(y, tipY + 0.005),
                        vx: 0,
                        vy: Math.max(0, vy),
                        rot,
                        spin,
                        hooked: pegIndex,
                        slot,
                        settle: 0,
                    };
                }
            }

            return { ...ring, x, y, vx, vy, rot, spin, dumped };
        });

        ringsRef.current = next;
        setRings(next);

        // Mirror summed strengths to state so the SVG can show jet streams.
        // Update only when meaningful change to cut re-renders.
        const newJet = {
            left: Math.min(2, leftStrength),
            center: Math.min(2, centerStrength),
            right: Math.min(2, rightStrength),
        };
        if (
            Math.abs(newJet.left - jetIntensity.left) > 0.05 ||
            Math.abs(newJet.center - jetIntensity.center) > 0.05 ||
            Math.abs(newJet.right - jetIntensity.right) > 0.05
        ) {
            setJetIntensity(newJet);
        }

        const nextHookedCount = next.filter((ring) => ring.hooked !== null).length;
        if (caughtThisFrame && nextHookedCount >= RING_COUNT) {
            finishRound();
        }
        // Won → playing transition. Two conditions must hold before
        // the banner retracts: (1) every ring is unhooked, and (2)
        // every ring has touched the ceiling during this won cycle.
        // The dumped flag is the "yes, it actually rose all the way
        // up" proof; without it a marginal slip-off would clear the
        // round before the visual gag has played out. Catches stay
        // disabled for dumped rings until they hit the floor again,
        // so the falling rings can't re-hook on the way down.
        const allDumped = next.every((ring) => ring.dumped);
        if (
            statusRef.current === 'won' &&
            nextHookedCount === 0 &&
            allDumped
        ) {
            statusRef.current = 'playing';
            endedRef.current = false;
            setGameStatus('playing');
        }
    }, [finishRound, jetIntensity]);

    useEffect(() => {
        let frame = 0;
        let last = Date.now();

        const tick = () => {
            const now = Date.now();
            const dt = Math.min((now - last) / 1000, 0.034);
            last = now;

            // Physics runs every frame — even after a win — so rings
            // continue to settle into their slots and react to tilt.
            // Pulses are still gated to playing-only inside firePulse,
            // so the win state can't be disturbed by button presses;
            // only the inversion gesture (handled inside stepPhysics)
            // can reset the round.
            stepPhysics(dt, now);

            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(frame);
        };
    }, [stepPhysics]);

    // The SVG fills the InnerScreen cavity 1:1 — no inner bezel, no
    // padding. We deliberately use the NON-expanded cavity (78% × 51%
    // on phones) because the painted "screen window" in the casing
    // image lines up with that smaller rect — `expanded` blows the
    // content out to 88% × 65%, which clips into the painted L/C/R
    // buttons. HUD is absolute-positioned over the top edge so the
    // back and restart controls float above the water without stealing
    // tank height. The casing's painted buttons remain visible so the
    // tactile pulse driver is the casing itself.
    return (
        <View
            style={StyleSheet.absoluteFill}
            pointerEvents="box-none"
            testID="water-ring-toss-screen"
        >
            <InnerScreen
                onLeftButtonPress={() => firePulse('left')}
                onCenterButtonPress={() => firePulse('center')}
                onRightButtonPress={() => firePulse('right')}
                leftButtonText="◀"
                centerButtonText="▲"
                rightButtonText="▶"
                showBackgroundImage={false}
            >
                <View style={styles.tankFill}>
                    <Svg
                        width="100%"
                        height="100%"
                        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
                        preserveAspectRatio="xMidYMid slice"
                    >
                            <Defs>
                                <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
                                    <Stop offset="0" stopColor="#A9E4ED" />
                                    <Stop offset="0.5" stopColor="#5BB7C2" />
                                    <Stop offset="1" stopColor="#2C7A85" />
                                </LinearGradient>
                                <LinearGradient id="surface" x1="0" y1="0" x2="0" y2="1">
                                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.78" />
                                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                                </LinearGradient>
                                <LinearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
                                    <Stop offset="0" stopColor="#F7FDFF" stopOpacity="0.4" />
                                    <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
                                    <Stop offset="1" stopColor="#D8F3F6" stopOpacity="0.14" />
                                </LinearGradient>
                                <RadialGradient id="jetGlow" cx="0.5" cy="1" rx="0.5" ry="0.7">
                                    <Stop offset="0" stopColor="#E9FDFF" stopOpacity="0.85" />
                                    <Stop offset="1" stopColor="#E9FDFF" stopOpacity="0" />
                                </RadialGradient>
                            </Defs>

                            {/* Water body — covers the FULL viewBox (no
                                inner bezel) since the SVG is sliced to
                                fill the cavity edge-to-edge. */}
                            <Rect
                                x="0"
                                y="0"
                                width={VIEWBOX_WIDTH}
                                height={VIEWBOX_HEIGHT}
                                fill="url(#water)"
                            />
                            <Rect
                                x="0"
                                y="0"
                                width={VIEWBOX_WIDTH}
                                height={36}
                                fill="url(#surface)"
                                opacity="0.7"
                            />

                            {/* BACK LAYER of hooked rings — drawn BEFORE
                                the peg shafts so the top arc of each ring's
                                donut disappears behind the peg, while the
                                bottom arc gets overdrawn by the matching
                                front-layer pass below. Rendered as a FULL
                                circle (not a half arc) so there's no butt-
                                cap seam at the equator: the front layer
                                redraws the bottom continuously over the
                                same color, hiding any discontinuity. Sorted
                                by slot ascending so upper rings render on
                                TOP of lower rings — without this a slot-1
                                ring with a low id can get tucked behind
                                the slot-0 ring beneath it. */}
                            {[...rings]
                                .filter((ring) => ring.hooked !== null)
                                .sort((a, b) => a.slot - b.slot)
                                .map((ring) => {
                                const cx = ring.x * VIEWBOX_WIDTH;
                                const cy = ring.y * VIEWBOX_HEIGHT;
                                const r = RING_RADIUS;
                                return (
                                    <G key={`ring-back-${ring.id}`}>
                                        <Circle
                                            cx={cx}
                                            cy={cy}
                                            r={r}
                                            stroke="#0A2A28"
                                            strokeWidth="8"
                                            opacity="0.45"
                                            fill="none"
                                        />
                                        <Circle
                                            cx={cx}
                                            cy={cy - 1}
                                            r={r}
                                            stroke={ring.color}
                                            strokeWidth="6.5"
                                            fill="none"
                                        />
                                        <Path
                                            d={`M ${cx - r * 0.55} ${cy - r * 0.7} A ${r} ${r} 0 0 1 ${cx + r * 0.18} ${cy - r * 0.95}`}
                                            stroke="#FFFFFF"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            fill="none"
                                            opacity="0.85"
                                        />
                                    </G>
                                );
                            })}

                            {/* Peg SHAFTS — drawn between the back and front
                                arcs of any hooked ring so the shaft visually
                                pierces through the donut. Knob/cap is drawn
                                later, after rings, so it sits in front of
                                everything at the tip. */}
                            {PEGS.map((peg, index) => {
                                const x = peg.x * VIEWBOX_WIDTH;
                                const baseY = peg.baseY * VIEWBOX_HEIGHT;
                                const tipY = (peg.baseY - peg.height) * VIEWBOX_HEIGHT;
                                return (
                                    <G key={`peg-shaft-${index}`}>
                                        <Rect
                                            x={x - 3}
                                            y={tipY}
                                            width={6}
                                            height={baseY - tipY}
                                            rx="2.5"
                                            fill="#3C7460"
                                            stroke="#1F4438"
                                            strokeWidth="1.4"
                                        />
                                        <Path
                                            d={`M ${x - 1.8} ${tipY + 2} L ${x - 1.8} ${baseY - 2}`}
                                            stroke="#FFFFFF"
                                            strokeWidth="1"
                                            opacity="0.32"
                                            strokeLinecap="round"
                                        />
                                    </G>
                                );
                            })}

                            {/* Three nozzles + jet streams keyed off summed
                                pulse intensity. Width/opacity scale with the
                                stack — mashing a button visibly thickens the
                                column of water, which is the feedback for
                                "more pulses = more force". */}
                            {(['left', 'center', 'right'] as JetSide[]).map((side) => {
                                const intensity = jetIntensity[side];
                                const xN = JET_X[side];
                                const x = xN * VIEWBOX_WIDTH;
                                const showStream = intensity > 0.05;
                                const streamWidth = 6 + Math.min(28, intensity * 18);
                                const apex = clamp(VIEWBOX_HEIGHT - intensity * 280, 30, VIEWBOX_HEIGHT - 60);
                                return (
                                    <G key={side}>
                                        <Rect
                                            x={x - 12}
                                            y={VIEWBOX_HEIGHT - 24}
                                            width={24}
                                            height={16}
                                            rx="5"
                                            fill="#1F4438"
                                        />
                                        <Rect
                                            x={x - 8}
                                            y={VIEWBOX_HEIGHT - 28}
                                            width={16}
                                            height={5}
                                            rx="2"
                                            fill="#3C7460"
                                        />
                                        {showStream && (
                                            <>
                                                <Path
                                                    d={`M ${x - streamWidth} ${VIEWBOX_HEIGHT - 28}
                                                        Q ${x - streamWidth * 0.4} ${(apex + VIEWBOX_HEIGHT) / 2} ${x} ${apex}
                                                        Q ${x + streamWidth * 0.4} ${(apex + VIEWBOX_HEIGHT) / 2} ${x + streamWidth} ${VIEWBOX_HEIGHT - 28}
                                                        Z`}
                                                    fill="url(#jetGlow)"
                                                    opacity={Math.min(0.9, 0.4 + intensity * 0.3)}
                                                />
                                                <Path
                                                    d={`M ${x - streamWidth * 0.5} ${VIEWBOX_HEIGHT - 28}
                                                        Q ${x - 2} ${(apex + VIEWBOX_HEIGHT) / 2} ${x} ${apex + 8}
                                                        Q ${x + 2} ${(apex + VIEWBOX_HEIGHT) / 2} ${x + streamWidth * 0.5} ${VIEWBOX_HEIGHT - 28}
                                                        Z`}
                                                    fill="#FFFFFF"
                                                    opacity={Math.min(0.55, 0.2 + intensity * 0.2)}
                                                />
                                            </>
                                        )}
                                    </G>
                                );
                            })}

                            {/* Free rings render as a full rotated donut; a
                                HOOKED ring renders only its FRONT half here
                                (the back full circle was drawn earlier,
                                before the peg shafts). Hooked rings are
                                drawn FIRST (sorted by slot ascending so
                                upper stack members cover lower ones),
                                then free rings drawn AFTER (sorted by y
                                descending so surface rings cover floor
                                rings). Free rings always end up on top
                                of any hooked ring — a free ring drifting
                                past a peg shouldn't disappear behind the
                                ring stacked on it. */}
                            {[
                                ...rings
                                    .filter((ring) => ring.hooked !== null)
                                    .sort((a, b) => a.slot - b.slot),
                                ...rings
                                    .filter((ring) => ring.hooked === null)
                                    .sort((a, b) => b.y - a.y),
                            ].map((ring) => {
                                const cx = ring.x * VIEWBOX_WIDTH;
                                const cy = ring.y * VIEWBOX_HEIGHT;

                                if (ring.hooked !== null) {
                                    const r = RING_RADIUS;
                                    return (
                                        <G key={ring.id}>
                                            <Path
                                                d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`}
                                                stroke="#0A2A28"
                                                strokeWidth="8"
                                                opacity="0.45"
                                                fill="none"
                                            />
                                            <Path
                                                d={`M ${cx - r} ${cy - 1} A ${r} ${r} 0 0 0 ${cx + r} ${cy - 1}`}
                                                stroke={ring.color}
                                                strokeWidth="6.5"
                                                fill="none"
                                            />
                                        </G>
                                    );
                                }

                                // Use the spin-driven rotation so off-center
                                // pulses produce visible end-over-end flips.
                                // Reflection highlight is rendered OUTSIDE
                                // the rotated group so it stays anchored
                                // top-left in screen space — light source
                                // doesn't spin with the ring.
                                const angle = ((ring.rot * 180) / Math.PI).toFixed(1);
                                return (
                                    <G key={ring.id}>
                                        <G transform={`translate(${cx} ${cy}) rotate(${angle})`}>
                                            <Circle
                                                cx={0}
                                                cy={0}
                                                r={RING_RADIUS}
                                                fill="none"
                                                stroke="#0A2A28"
                                                strokeWidth="8"
                                                opacity="0.45"
                                            />
                                            <Circle
                                                cx={0}
                                                cy={-1}
                                                r={RING_RADIUS}
                                                fill="none"
                                                stroke={ring.color}
                                                strokeWidth="6.5"
                                            />
                                        </G>
                                        <Path
                                            d={`M ${cx - RING_RADIUS * 0.55} ${cy - RING_RADIUS * 0.7}
                                                A ${RING_RADIUS} ${RING_RADIUS} 0 0 1 ${cx + RING_RADIUS * 0.18} ${cy - RING_RADIUS * 0.95}`}
                                            stroke="#FFFFFF"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            fill="none"
                                            opacity="0.85"
                                        />
                                    </G>
                                );
                            })}

                            {/* Peg KNOBS — drawn after rings so the cap
                                covers the front of any hooked ring's hole,
                                making the peg look like it pierces through
                                the ring. */}
                            {PEGS.map((peg, index) => {
                                const x = peg.x * VIEWBOX_WIDTH;
                                const tipY = (peg.baseY - peg.height) * VIEWBOX_HEIGHT;
                                return (
                                    <G key={`peg-knob-${index}`}>
                                        <Circle
                                            cx={x}
                                            cy={tipY}
                                            r="4.5"
                                            fill="#F4D35E"
                                            stroke="#1F4438"
                                            strokeWidth="1.4"
                                        />
                                        <Circle
                                            cx={x - 1.3}
                                            cy={tipY - 1.3}
                                            r="1.4"
                                            fill="#FFF6CC"
                                            opacity="0.85"
                                        />
                                    </G>
                                );
                            })}

                            {/* Glass overlay last */}
                            <Rect
                                x="0"
                                y="0"
                                width={VIEWBOX_WIDTH}
                                height={VIEWBOX_HEIGHT}
                                fill="url(#glass)"
                                pointerEvents="none"
                            />
                            <Path
                                d={`M 12 22 C 18 ${VIEWBOX_HEIGHT * 0.4} 16 ${VIEWBOX_HEIGHT * 0.7} 9 ${VIEWBOX_HEIGHT - 22}`}
                                stroke="#FFFFFF"
                                strokeWidth="5"
                                opacity="0.3"
                                strokeLinecap="round"
                                fill="none"
                            />

                    </Svg>

                    <View style={styles.hudOverlay} pointerEvents="box-none">
                        <TouchableOpacity
                            onPress={onBack}
                            style={styles.hudButton}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        >
                            <Text style={styles.hudButtonText}>{'<'}</Text>
                        </TouchableOpacity>
                        <Text style={styles.hudScore}>
                            {hookedCount}/{RING_COUNT}
                        </Text>
                        <View style={styles.hudSpacer} />
                    </View>

                    {gameStatus === 'won' && (
                        <View pointerEvents="none" style={styles.bannerWrap}>
                            <Text style={styles.banner}>CLEAR!</Text>
                            <Text style={styles.bannerSub}>Every ring landed.</Text>
                            <Text style={styles.bannerHint}>Flip the phone upside-down to reset</Text>
                        </View>
                    )}
                </View>
            </InnerScreen>
        </View>
    );
};

const styles = StyleSheet.create({
    // The tank fills the InnerScreen cavity 1:1 — no padding, no inner
    // bezel. preserveAspectRatio="slice" on the SVG means the water
    // graphic always extends to all four edges, so there's no visible
    // letterbox even when the cavity aspect doesn't match the viewBox.
    tankFill: {
        flex: 1,
        alignSelf: 'stretch',
        position: 'relative',
        backgroundColor: '#0A2A28',
    },
    hudOverlay: {
        position: 'absolute',
        top: 6,
        left: 8,
        right: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    hudButton: {
        width: 28,
        height: 22,
        borderRadius: 6,
        backgroundColor: 'rgba(31, 68, 56, 0.85)',
        borderWidth: 1,
        borderColor: '#F4D35E',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Invisible spacer matching the back button's footprint so the
    // score stays centered between the back tap target on the left
    // and an empty slot on the right after the reset button was
    // dropped in favor of the inversion gesture.
    hudSpacer: {
        width: 28,
        height: 22,
    },
    hudButtonText: {
        color: '#F4D35E',
        fontFamily: 'Monaco',
        fontSize: 14,
        transform: [{ translateY: Platform.OS === 'android' ? -1 : 0 }],
    },
    hudScore: {
        color: '#F4D35E',
        fontFamily: 'Monaco',
        fontSize: 16,
        textShadowColor: 'rgba(10, 42, 40, 0.85)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    bannerWrap: {
        position: 'absolute',
        top: '38%',
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingVertical: 10,
        backgroundColor: 'rgba(10, 42, 40, 0.88)',
    },
    banner: {
        color: '#F4D35E',
        fontFamily: 'Monaco',
        fontSize: 28,
        textAlign: 'center',
    },
    bannerSub: {
        color: colors.mintPale,
        fontFamily: 'Monaco',
        fontSize: 14,
        marginTop: 2,
    },
    bannerHint: {
        color: '#A9E4ED',
        fontFamily: 'Monaco',
        fontSize: 12,
        marginTop: 6,
        opacity: 0.85,
    },
});

export default WaterRingToss;
