import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Image,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    LayoutChangeEvent,
    PanResponder,
    Animated,
    Easing,
    type GestureResponderEvent,
    type PanResponderGestureState,
    type ImageStyle,
} from 'react-native';
import {
    type RoomBand,
    type RoomItem,
    type RoomItemAssetKey,
    type RoomLayout,
    type RoomRotation,
    WALL_BAND_FRACTION,
    WALL_GRID,
    FLOOR_GRID,
    ROOM_INTERIOR,
    ROOM_INTERIOR_W_FRACTION,
    ROOM_INTERIOR_H_FRACTION,
    containedRect,
    effectiveAspect,
    effectiveSpan,
    gridFor,
    itemPixelRect,
    resolveRoomAsset,
} from '../../services/RoomLayout';
import { Frames, Rooms } from '../../assets';
import { colors } from '../../styles/tokens';

interface PaletteEntry {
    asset: RoomItemAssetKey;
    label: string;
    band: RoomBand;
    span: { w: number; h: number };
}

// Span heights tuned to each sprite's natural aspect at the current cell
// sizes (wall ≈ 87×98, floor ≈ 87×89 in source bitmap px). When the cell
// box matches the sprite extent, `resizeMode="contain"` centers it with
// minimal margin — placing a decor item at gy=0 paints against the band
// boundary instead of letterboxed several rows below it.
const PALETTE: PaletteEntry[] = [
    { asset: 'decals.poster1', label: 'Poster A', band: 'wall', span: { w: 2, h: 3 } },
    { asset: 'decals.poster2', label: 'Poster B', band: 'wall', span: { w: 2, h: 3 } },
    { asset: 'decals.window', label: 'Window', band: 'wall', span: { w: 4, h: 4 } },
    { asset: 'decals.lights', label: 'Lights', band: 'wall', span: { w: 4, h: 4 } },
    { asset: 'floor.carpet', label: 'Carpet', band: 'floor', span: { w: 4, h: 2 } },
    { asset: 'floor.bed', label: 'Bed', band: 'floor', span: { w: 3, h: 5 } },
    { asset: 'floor.desk', label: 'Desk', band: 'floor', span: { w: 4, h: 4 } },
    { asset: 'floor.plant', label: 'Plant', band: 'floor', span: { w: 2, h: 3 } },
    { asset: 'minis.aro', label: 'Aro', band: 'floor', span: { w: 2, h: 3 } },
];

interface RoomEditorProps {
    layout: RoomLayout;
    onChange: (next: RoomLayout) => void;
    onDragItemChange?: (id: string | null) => void;
    /** Reserved space at the bottom (e.g. parent back button). The Edit chip
        and palette stack sit above this. */
    bottomInset?: number;
    /** Edit mode is owned by the parent (Gallery) so the Room view can
        paint its grid behind the items when this is true. */
    editing: boolean;
    onEditingChange: (next: boolean) => void;
}

type DragSource =
    | { kind: 'palette'; asset: RoomItemAssetKey; band: RoomBand; span: { w: number; h: number } }
    | { kind: 'placed'; item: RoomItem };

interface DragMeta {
    asset: RoomItemAssetKey;
    band: RoomBand;
    /** Cell footprint after rotation — palette items always 0°, placed items inherit. */
    span: { w: number; h: number };
    rotation: RoomRotation;
    width: number;
    height: number;
}

interface DropPreview {
    asset: RoomItemAssetKey;
    band: RoomBand;
    gx: number;
    gy: number;
    /** Effective (rotated) cell footprint, so a 5×3 rotated bed reserves the right cells. */
    span: { w: number; h: number };
    rotation: RoomRotation;
    valid: boolean;
}

interface RotatingItem {
    /** Source item *before* the rotation lands. We commit on animation end. */
    item: RoomItem;
    nextRotation: RoomRotation;
    /** Underlying Image rect (pre-rotation). The rotate transform applies on top. */
    imgLeft: number;
    imgTop: number;
    imgW: number;
    imgH: number;
    fromDeg: number;
    toDeg: number;
    /** Center-to-center drift when the new effective span sits on different cells. */
    dx: number;
    dy: number;
}

let nextItemSerial = 1;
const newItemId = (asset: RoomItemAssetKey) =>
    `${asset}-${Date.now().toString(36)}-${nextItemSerial++}`;

const MIN_PLACED_TOUCH_SIZE = 48;
const PALETTE_DRAG_THRESHOLD = 6;
// Below this finger-travel a placed-item release is treated as a tap, not a
// drag — so beginDrag never fires for taps and double-tap can take over.
const TAP_MOVE_THRESHOLD = 8;
// Two taps within this window on the same item triggers rotation.
const DOUBLE_TAP_MS = 320;
// Rotation animation timings (lift → rotate-with-overshoot → fall).
const ROT_LIFT_MS = 120;
const ROT_TURN_MS = 240;
const ROT_FALL_MS = 160;
// Edit button sits at right:16, image is 60px wide. Leave 8px gap before
// the drawer starts, and reserve another 16px on the far-left side.
const PALETTE_DRAWER_RIGHT_OFFSET = 16 + 60 + 8;
const PALETTE_DRAWER_RESERVED = PALETTE_DRAWER_RIGHT_OFFSET + 16;

// Interaction-recency stacking: any touch on a placed item shuffles it to
// the end of the layout array. The renderer sorts by `z ?? 0` then keeps
// array order on ties (stable sort), so a fresh interaction always paints
// on top within its band — no explicit z bookkeeping needed.
function bumpAndUpdate(
    layout: RoomLayout,
    id: string,
    update: (item: RoomItem) => RoomItem,
): RoomLayout {
    const item = layout.find((it) => it.id === id);
    if (!item) return layout;
    const next = update(item);
    // No-op fast path: same data + already last → don't trigger a re-render.
    if (next === item && layout[layout.length - 1]?.id === id) return layout;
    return [...layout.filter((it) => it.id !== id), next];
}

function sameDropPreview(a: DropPreview | null, b: DropPreview | null) {
    if (!a || !b) return a === b;
    return (
        a.band === b.band &&
        a.gx === b.gx &&
        a.gy === b.gy &&
        a.span.w === b.span.w &&
        a.span.h === b.span.h &&
        a.valid === b.valid
    );
}

const RoomEditor: React.FC<RoomEditorProps> = ({
    layout,
    onChange,
    onDragItemChange,
    bottomInset = 0,
    editing,
    onEditingChange,
}) => {
    const [size, setSize] = useState({ w: 0, h: 0 });
    // The active drag's display metadata. Non-null while a gesture is in
    // flight; rendering the ghost keys off this.
    const [dragMeta, setDragMeta] = useState<DragMeta | null>(null);
    // Hide the in-place sprite of a placed item while it's being dragged so
    // the ghost is the only visible representation. We *don't* mutate
    // `layout` for this — that would unmount the responder mid-gesture and
    // immediately terminate the drag.
    const [draggedId, setDraggedId] = useState<string | null>(null);
    // True while the finger is over the trash zone — drives the trash's
    // hover highlight so the user gets a confirm-on-release cue.
    const [trashHover, setTrashHover] = useState(false);
    const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
    // Active rotation animation. While non-null, <Room> hides the source
    // item (via onDragItemChange) and we render an animated overlay copy
    // that lifts, rotates a quarter-turn, and lands at the new cell.
    const [rotating, setRotating] = useState<RotatingItem | null>(null);
    const rotateAnim = useRef(new Animated.Value(0)).current;
    // Last-tap ledger for double-tap detection on placed items.
    const lastTapRef = useRef<{ id: string; time: number } | null>(null);
    // Drawer slide progress: 0 = closed (palette tucked under the edit
    // button, off the right edge), 1 = fully extended leftward. Driven by
    // `editing`; native-driver-friendly so the animation stays smooth even
    // while drags are in flight.
    const drawerProgress = useRef(new Animated.Value(0)).current;

    const containerRef = useRef<View>(null);
    const containerOriginRef = useRef({ x: 0, y: 0 });
    const layoutRef = useRef(layout);
    const onChangeRef = useRef(onChange);
    const onDragItemChangeRef = useRef(onDragItemChange);
    // Source-of-truth for the active drag, accessed inside gesture
    // callbacks where setState is async/stale.
    const dragRef = useRef<{ source: DragSource; meta: DragMeta } | null>(null);
    const ghostPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

    layoutRef.current = layout;
    onChangeRef.current = onChange;
    onDragItemChangeRef.current = onDragItemChange;

    useEffect(() => {
        Animated.timing(drawerProgress, {
            toValue: editing ? 1 : 0,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [editing, drawerProgress]);

    const handleLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ w: width, h: height });
        // Remeasure absolute origin so finger pageX/pageY → container-local
        // coords stays correct even after rotation/safe-area shifts.
        requestAnimationFrame(() => {
            containerRef.current?.measureInWindow((x, y) => {
                containerOriginRef.current = { x, y };
            });
        });
    };

    const interiorLeft = size.w * ROOM_INTERIOR.leftFraction;
    const interiorTop = size.h * ROOM_INTERIOR.topFraction;
    const interiorW = size.w * ROOM_INTERIOR_W_FRACTION;
    const interiorH = size.h * ROOM_INTERIOR_H_FRACTION;
    const wallHeight = interiorH * WALL_BAND_FRACTION;
    const floorHeight = interiorH - wallHeight;
    const editButtonBottom = bottomInset - size.h * 0.005;

    // Trash drop target = the edit button itself (it morphs into a trash
    // icon while a placed item is being dragged). Rect computed from the
    // button's `right` / `bottom` style + image size + padding so the hit
    // zone stays in sync if those tweak. Slop widens the target so users
    // don't have to be pixel-perfect.
    const EDIT_BTN_W = 68; // image 60 + padding 4×2
    const EDIT_BTN_H = 73; // image 65 + padding 4×2
    const editButtonRect = useMemo(
        () => {
            const right = size.w - 16;
            const bottom = size.h - editButtonBottom;
            return {
                left: right - EDIT_BTN_W,
                right,
                top: bottom - EDIT_BTN_H,
                bottom,
            };
        },
        [size.w, size.h, editButtonBottom],
    );

    const isOverTrash = (pageX: number, pageY: number) => {
        const x = pageX - containerOriginRef.current.x;
        const y = pageY - containerOriginRef.current.y;
        const slop = 12;
        return (
            x >= editButtonRect.left - slop &&
            x <= editButtonRect.right + slop &&
            y >= editButtonRect.top - slop &&
            y <= editButtonRect.bottom + slop
        );
    };

    const ghostSizeFor = (band: RoomBand, span: { w: number; h: number }) => {
        const grid = gridFor(band);
        const bandH = band === 'wall' ? wallHeight : floorHeight;
        return {
            width: (interiorW / grid.cols) * span.w,
            height: (bandH / grid.rows) * span.h,
        };
    };

    const dropTargetFor = (
        pageX: number,
        pageY: number,
        span: { w: number; h: number },
    ): { band: RoomBand; gx: number; gy: number } | null => {
        const localX = pageX - containerOriginRef.current.x - interiorLeft;
        const localY = pageY - containerOriginRef.current.y - interiorTop;
        if (localX < 0 || localX > interiorW || localY < 0 || localY > interiorH) return null;
        const band: RoomBand = localY < wallHeight ? 'wall' : 'floor';
        const bandTop = band === 'wall' ? 0 : wallHeight;
        const bandHeight = band === 'wall' ? wallHeight : floorHeight;
        const grid = gridFor(band);
        const cellW = interiorW / grid.cols;
        const cellH = bandHeight / grid.rows;
        const rawGx = Math.floor((localX - (span.w * cellW) / 2) / cellW);
        const rawGy = Math.floor((localY - bandTop - (span.h * cellH) / 2) / cellH);
        const gx = Math.max(0, Math.min(grid.cols - span.w, rawGx));
        const gy = Math.max(0, Math.min(grid.rows - span.h, rawGy));
        return { band, gx, gy };
    };

    const previewFor = (
        source: DragSource,
        pageX: number,
        pageY: number,
    ): DropPreview | null => {
        const rotation: RoomRotation =
            source.kind === 'palette' ? 0 : source.item.rotation ?? 0;
        const span =
            source.kind === 'palette'
                ? source.span
                : effectiveSpan(source.item);
        const drop = dropTargetFor(pageX, pageY, span);
        if (!drop) return null;
        const allowedBand = source.kind === 'palette' ? source.band : source.item.band;
        const asset = source.kind === 'palette' ? source.asset : source.item.asset;
        return {
            ...drop,
            asset,
            span,
            rotation,
            valid: drop.band === allowedBand,
        };
    };

    const updateDropPreview = (next: DropPreview | null) => {
        setDropPreview((prev) => (sameDropPreview(prev, next) ? prev : next));
    };

    const clearDragState = () => {
        setDraggedId(null);
        setDragMeta(null);
        setTrashHover(false);
        updateDropPreview(null);
        onDragItemChangeRef.current?.(null);
    };

    const beginDrag = (source: DragSource, pageX: number, pageY: number) => {
        const band = source.kind === 'palette' ? source.band : source.item.band;
        const rotation: RoomRotation =
            source.kind === 'palette' ? 0 : source.item.rotation ?? 0;
        const span =
            source.kind === 'palette' ? source.span : effectiveSpan(source.item);
        const asset = source.kind === 'palette' ? source.asset : source.item.asset;
        const { width, height } = ghostSizeFor(band, span);
        const meta: DragMeta = { asset, band, span, rotation, width, height };
        ghostPos.setValue({
            x: pageX - containerOriginRef.current.x - width / 2,
            y: pageY - containerOriginRef.current.y - height / 2,
        });
        dragRef.current = { source, meta };
        if (source.kind === 'placed') {
            setDraggedId(source.item.id);
            onDragItemChangeRef.current?.(source.item.id);
        } else {
            onDragItemChangeRef.current?.(null);
        }
        setDragMeta(meta);
        updateDropPreview(previewFor(source, pageX, pageY));
    };

    const updateDrag = (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const cur = dragRef.current;
        if (!cur) return;
        const pageX = g.moveX || g.x0;
        const pageY = g.moveY || g.y0;
        ghostPos.setValue({
            x: pageX - containerOriginRef.current.x - cur.meta.width / 2,
            y: pageY - containerOriginRef.current.y - cur.meta.height / 2,
        });
        if (cur.source.kind === 'placed') {
            const overTrash = isOverTrash(pageX, pageY);
            setTrashHover(overTrash);
            if (overTrash) {
                updateDropPreview(null);
                return;
            }
        }
        updateDropPreview(previewFor(cur.source, pageX, pageY));
    };

    const endDrag = (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const cur = dragRef.current;
        dragRef.current = null;
        if (!cur) {
            clearDragState();
            return;
        }
        const { source } = cur;
        // Use the effective (rotated) span for drop math so a rotated 5×3
        // bed reserves the right cells when released.
        const span =
            source.kind === 'palette' ? source.span : effectiveSpan(source.item);
        const currentLayout = layoutRef.current;
        // gestureState.moveX is 0 if no move occurred — fall back to the
        // grant point so a tap-and-release on a palette item lands at the
        // touch location instead of (0,0).
        const dropX = g.moveX || g.x0;
        const dropY = g.moveY || g.y0;

        if (source.kind === 'palette') {
            const drop = dropTargetFor(dropX, dropY, span);
            if (drop && drop.band === source.band) {
                onChangeRef.current([
                    ...currentLayout,
                    {
                        id: newItemId(source.asset),
                        asset: source.asset,
                        band: source.band,
                        gx: drop.gx,
                        gy: drop.gy,
                        span: source.span,
                    },
                ]);
            }
            clearDragState();
            return;
        }

        // Placed item — trash beats grid, so check trash first.
        if (isOverTrash(dropX, dropY)) {
            onChangeRef.current(currentLayout.filter((it) => it.id !== source.item.id));
            clearDragState();
            return;
        }
        const drop = dropTargetFor(dropX, dropY, span);
        // Outside grid or wrong band → leave in place (no layout change).
        if (!drop || drop.band !== source.item.band) {
            clearDragState();
            return;
        }
        // Same band, valid cell → reposition AND bump to front-of-stack.
        onChangeRef.current(
            bumpAndUpdate(currentLayout, source.item.id, (it) => ({
                ...it,
                gx: drop.gx,
                gy: drop.gy,
            })),
        );
        clearDragState();
    };

    // Resolve the underlying-Image rect (pre-rotation transform) for an item
    // at its current grid cell. Matches the math in <Room>'s renderItem so
    // the rotation overlay lines up pixel-for-pixel with the static sprite.
    const resolveImageRect = (item: RoomItem) => {
        const effSpan = effectiveSpan(item);
        const bandTop = item.band === 'wall' ? 0 : wallHeight;
        const bandH = item.band === 'wall' ? wallHeight : floorHeight;
        const cell = itemPixelRect({ ...item, span: effSpan }, interiorW, bandH);
        const sprite = containedRect(
            cell.width,
            cell.height,
            effectiveAspect(item.asset, item.rotation),
        );
        const rot = item.rotation ?? 0;
        const swap = rot === 1 || rot === 3;
        const imgW = swap ? sprite.height : sprite.width;
        const imgH = swap ? sprite.width : sprite.height;
        const visualLeft = cell.left + interiorLeft + sprite.dx;
        const visualTop = cell.top + bandTop + interiorTop + sprite.dy;
        return {
            imgLeft: visualLeft + (sprite.width - imgW) / 2,
            imgTop: visualTop + (sprite.height - imgH) / 2,
            imgW,
            imgH,
            centerX: visualLeft + sprite.width / 2,
            centerY: visualTop + sprite.height / 2,
            rotateDeg: rot * 90,
        };
    };

    const handlePlacedTap = (item: RoomItem) => {
        // Any tap counts as interaction → bump to top-of-band (no field change).
        onChangeRef.current(bumpAndUpdate(layoutRef.current, item.id, (it) => it));
        const now = Date.now();
        const last = lastTapRef.current;
        if (last && last.id === item.id && now - last.time <= DOUBLE_TAP_MS) {
            lastTapRef.current = null;
            startRotation(item);
            return;
        }
        lastTapRef.current = { id: item.id, time: now };
    };

    const startRotation = (item: RoomItem) => {
        // Concurrent rotation guard — let the active one finish first.
        if (rotating) return;
        const cur = (item.rotation ?? 0) as RoomRotation;
        const next = (((cur + 1) % 4) as RoomRotation);
        // Validity: the new effective span has to fit at the current gx,gy.
        const nextSpan = effectiveSpan({ span: item.span, rotation: next });
        const grid = gridFor(item.band);
        if (item.gx + nextSpan.w > grid.cols || item.gy + nextSpan.h > grid.rows) return;

        const oldRect = resolveImageRect(item);
        const nextRect = resolveImageRect({ ...item, rotation: next });
        const dx = nextRect.centerX - oldRect.centerX;
        const dy = nextRect.centerY - oldRect.centerY;

        // Hide the static sprite under <Room> while the overlay animates.
        onDragItemChangeRef.current?.(item.id);
        setRotating({
            item,
            nextRotation: next,
            imgLeft: oldRect.imgLeft,
            imgTop: oldRect.imgTop,
            imgW: oldRect.imgW,
            imgH: oldRect.imgH,
            fromDeg: oldRect.rotateDeg,
            toDeg: nextRect.rotateDeg,
            dx,
            dy,
        });
        rotateAnim.setValue(0);

        Animated.sequence([
            Animated.timing(rotateAnim, {
                toValue: 1,
                duration: ROT_LIFT_MS,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(rotateAnim, {
                toValue: 2,
                duration: ROT_TURN_MS,
                easing: Easing.out(Easing.back(1.4)),
                useNativeDriver: true,
            }),
            Animated.timing(rotateAnim, {
                toValue: 3,
                duration: ROT_FALL_MS,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start(({ finished }) => {
            if (!finished) {
                // Interrupted (e.g. unmount) — still reveal the source item.
                setRotating(null);
                onDragItemChangeRef.current?.(null);
                return;
            }
            onChangeRef.current(
                bumpAndUpdate(layoutRef.current, item.id, (it) => ({
                    ...it,
                    rotation: next,
                })),
            );
            setRotating(null);
            onDragItemChangeRef.current?.(null);
        });
    };

    // One responder factory per role. `useMemo` keys off `editing`/size so the
    // closure sees current dimensions; mid-gesture we never re-run because
    // those don't change while a finger is down.
    const paletteResponders = useMemo(
        () =>
            PALETTE.map((entry) =>
                PanResponder.create({
                    onStartShouldSetPanResponder: () => false,
                    onMoveShouldSetPanResponder: (_e, g) =>
                        editing &&
                        size.w > 0 &&
                        Math.abs(g.dy) > PALETTE_DRAG_THRESHOLD &&
                        Math.abs(g.dy) >= Math.abs(g.dx),
                    onPanResponderTerminationRequest: () => false,
                    onPanResponderGrant: (e) =>
                        beginDrag(
                            {
                                kind: 'palette',
                                asset: entry.asset,
                                band: entry.band,
                                span: entry.span,
                            },
                            e.nativeEvent.pageX,
                            e.nativeEvent.pageY,
                        ),
                    onPanResponderMove: updateDrag,
                    onPanResponderRelease: endDrag,
                    onPanResponderTerminate: endDrag,
                }),
            ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [editing, size.w, size.h],
    );

    // Placed-item gesture: drag starts immediately on grant so the ghost
    // appears under the finger without delay. Tap detection happens at
    // release: a near-zero travel distance is treated as a tap (no drop
    // commit) and handed to the double-tap → rotation pipeline.
    const makePlacedResponder = (item: RoomItem) =>
        PanResponder.create({
            onStartShouldSetPanResponder: () => editing && size.w > 0,
            onMoveShouldSetPanResponder: () => editing && size.w > 0,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (e) =>
                beginDrag(
                    { kind: 'placed', item },
                    e.nativeEvent.pageX,
                    e.nativeEvent.pageY,
                ),
            onPanResponderMove: updateDrag,
            onPanResponderRelease: (e, g) => {
                if (Math.hypot(g.dx, g.dy) < TAP_MOVE_THRESHOLD) {
                    clearDragState();
                    handlePlacedTap(item);
                    return;
                }
                endDrag(e, g);
            },
            onPanResponderTerminate: endDrag,
        });

    const sortedItems = useMemo(
        () => [...layout].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)),
        [layout],
    );

    return (
        <View
            ref={containerRef}
            style={StyleSheet.absoluteFill}
            onLayout={handleLayout}
            pointerEvents="box-none"
        >
            {/* Grid + band divider live in <Room> so they paint behind the
                items. Only edit-mode affordances stay in this overlay. */}

            {editing &&
                size.w > 0 &&
                dropPreview &&
                renderDropPreview(dropPreview, interiorW, wallHeight, floorHeight, interiorLeft, interiorTop)}

            {editing && size.w > 0 &&
                sortedItems.map((item) => {
                    const bandTop = item.band === 'wall' ? 0 : wallHeight;
                    const bandH = item.band === 'wall' ? wallHeight : floorHeight;
                    // Effective span/aspect = rotated footprint + visible
                    // aspect, so the highlight + hit zone wrap the sprite as
                    // the user sees it (not its un-rotated cell box).
                    const effSpan = effectiveSpan(item);
                    const rect = itemPixelRect({ ...item, span: effSpan }, interiorW, bandH);
                    const sprite = containedRect(
                        rect.width,
                        rect.height,
                        effectiveAspect(item.asset, item.rotation),
                    );
                    const itemLeft = rect.left + interiorLeft + sprite.dx;
                    const itemTop = rect.top + bandTop + interiorTop + sprite.dy;
                    const extraW = Math.max(0, MIN_PLACED_TOUCH_SIZE - sprite.width) / 2;
                    const extraH = Math.max(0, MIN_PLACED_TOUCH_SIZE - sprite.height) / 2;
                    const hitLeft = Math.max(0, itemLeft - extraW);
                    const hitTop = Math.max(0, itemTop - extraH);
                    const hitRight = Math.min(size.w, itemLeft + sprite.width + extraW);
                    const hitBottom = Math.min(size.h, itemTop + sprite.height + extraH);
                    const responder = makePlacedResponder(item);
                    const isDragged = draggedId === item.id || rotating?.item.id === item.id;
                    return (
                        <View
                            key={item.id}
                            {...responder.panHandlers}
                            style={[
                                styles.placedOverlay,
                                {
                                    left: hitLeft,
                                    top: hitTop,
                                    width: hitRight - hitLeft,
                                    height: hitBottom - hitTop,
                                    opacity: isDragged ? 0 : 1,
                                },
                            ]}
                        >
                            <View
                                style={[
                                    styles.placedHighlight,
                                    {
                                        left: itemLeft - hitLeft,
                                        top: itemTop - hitTop,
                                        width: sprite.width,
                                        height: sprite.height,
                                    },
                                ]}
                            />
                        </View>
                    );
                })}

            {/* No standalone trash zone — the edit button itself morphs
                into a trash drop target while a placed item is being
                dragged (see TouchableOpacity below). */}

            {dragMeta && (() => {
                // `dragMeta.span/width/height` is the *effective* cell box.
                // The visible aspect after rotation matches that box, so we
                // fit the sprite to it using effectiveAspect; the underlying
                // Image is sized with swapped dims so the rotate transform
                // produces the right visual rect.
                const ghostSprite = containedRect(
                    dragMeta.width,
                    dragMeta.height,
                    effectiveAspect(dragMeta.asset, dragMeta.rotation),
                );
                const swap = dragMeta.rotation === 1 || dragMeta.rotation === 3;
                const imgW = swap ? ghostSprite.height : ghostSprite.width;
                const imgH = swap ? ghostSprite.width : ghostSprite.height;
                return (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.ghost,
                            {
                                width: dragMeta.width,
                                height: dragMeta.height,
                                transform: [
                                    { translateX: ghostPos.x },
                                    { translateY: ghostPos.y },
                                ],
                            },
                        ]}
                    >
                        <Image
                            source={resolveRoomAsset(dragMeta.asset)}
                            style={{
                                position: 'absolute',
                                left: ghostSprite.dx + (ghostSprite.width - imgW) / 2,
                                top: ghostSprite.dy + (ghostSprite.height - imgH) / 2,
                                width: imgW,
                                height: imgH,
                                transform: dragMeta.rotation
                                    ? [{ rotate: `${dragMeta.rotation * 90}deg` }]
                                    : undefined,
                            } as ImageStyle}
                        />
                    </Animated.View>
                );
            })()}

            {rotating && (() => {
                // Three-phase animation: lift (0→1), rotate-with-overshoot
                // (1→2), fall (2→3). The rotate transform interpolates from
                // fromDeg→toDeg only during phase 1→2 so the lift and fall
                // happen at the start/end rotation, not mid-turn.
                const liftDist = Math.max(14, Math.min(36, rotating.imgH * 0.22));
                const translateY = rotateAnim.interpolate({
                    inputRange: [0, 1, 2, 3],
                    outputRange: [0, -liftDist, -liftDist + rotating.dy, rotating.dy],
                });
                const translateX = rotateAnim.interpolate({
                    inputRange: [0, 1, 2, 3],
                    outputRange: [0, 0, rotating.dx, rotating.dx],
                });
                const scale = rotateAnim.interpolate({
                    inputRange: [0, 1, 2, 3],
                    outputRange: [1, 1.08, 1.08, 1],
                });
                const rotate = rotateAnim.interpolate({
                    inputRange: [0, 1, 2, 3],
                    outputRange: [
                        `${rotating.fromDeg}deg`,
                        `${rotating.fromDeg}deg`,
                        `${rotating.toDeg}deg`,
                        `${rotating.toDeg}deg`,
                    ],
                });
                return (
                    <Animated.View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            left: rotating.imgLeft,
                            top: rotating.imgTop,
                            width: rotating.imgW,
                            height: rotating.imgH,
                            zIndex: 12,
                            elevation: 12,
                            transform: [
                                { translateX },
                                { translateY },
                                { scale },
                                { rotate },
                            ],
                        }}
                    >
                        <Image
                            source={resolveRoomAsset(rotating.item.asset)}
                            style={{ width: '100%', height: '100%' } as ImageStyle}
                        />
                    </Animated.View>
                );
            })()}

            {size.w > 0 && (
                <Animated.View
                    pointerEvents={editing ? 'box-none' : 'none'}
                    style={[
                        styles.paletteWrap,
                        {
                            right: PALETTE_DRAWER_RIGHT_OFFSET,
                            bottom: editButtonBottom,
                            width: Math.max(40, size.w - PALETTE_DRAWER_RESERVED),
                            transform: [
                                {
                                    // Closed = slid fully past the container's right edge.
                                    // drawer_left_after_translation must be ≥ size.w, which
                                    // requires translateX ≥ drawerWidth + RIGHT_OFFSET (drawer's
                                    // base left is at size.w - RIGHT_OFFSET - drawerWidth).
                                    // Extra +24 buffer hides any rounding/anti-alias edge.
                                    translateX: drawerProgress.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [
                                            Math.max(40, size.w - PALETTE_DRAWER_RESERVED) +
                                                PALETTE_DRAWER_RIGHT_OFFSET +
                                                24,
                                            0,
                                        ],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    <Image
                        source={Rooms.ui.invbutton1}
                        style={styles.paletteBackdrop as ImageStyle}
                        resizeMode="stretch"
                    />
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        scrollEnabled={!dragMeta}
                        style={styles.paletteFrame}
                        contentContainerStyle={styles.paletteContent}
                    >
                        {PALETTE.map((item, i) => (
                            <View
                                key={item.asset}
                                {...paletteResponders[i].panHandlers}
                                style={styles.paletteItem}
                            >
                                <Image
                                    source={resolveRoomAsset(item.asset)}
                                    style={styles.paletteImage as ImageStyle}
                                    resizeMode="contain"
                                />
                            </View>
                        ))}
                    </ScrollView>
                </Animated.View>
            )}

            <TouchableOpacity
                onPress={() => onEditingChange(!editing)}
                style={[styles.editButton, { bottom: editButtonBottom }]}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
                <Image
                    source={Frames.editButton}
                    style={styles.editButtonImage}
                    resizeMode="contain"
                />
                {editing && !(dragMeta && draggedId) && (
                    <View style={styles.editButtonActiveTint} pointerEvents="none" />
                )}
                {dragMeta && draggedId && (
                    <View
                        pointerEvents="none"
                        style={[
                            styles.editButtonTrashOverlay,
                            trashHover && styles.editButtonTrashOverlayHover,
                        ]}
                    >
                        <View style={styles.trashIconLid} />
                        <View style={styles.trashIconBody}>
                            <View style={styles.trashIconRib} />
                            <View style={styles.trashIconRib} />
                            <View style={styles.trashIconRib} />
                        </View>
                    </View>
                )}
            </TouchableOpacity>
        </View>
    );
};

function renderDropPreview(
    preview: DropPreview,
    width: number,
    wallHeight: number,
    floorHeight: number,
    interiorLeft: number,
    interiorTop: number,
) {
    const bandTop = preview.band === 'wall' ? 0 : wallHeight;
    const bandHeight = preview.band === 'wall' ? wallHeight : floorHeight;
    const rect = itemPixelRect(
        {
            band: preview.band,
            gx: preview.gx,
            gy: preview.gy,
            span: preview.span,
        },
        width,
        bandHeight,
    );
    const sprite = containedRect(
        rect.width,
        rect.height,
        effectiveAspect(preview.asset, preview.rotation),
    );
    return (
        <View
            pointerEvents="none"
            style={[
                styles.dropPreview,
                {
                    left: rect.left + interiorLeft + sprite.dx,
                    top: rect.top + bandTop + interiorTop + sprite.dy,
                    width: sprite.width,
                    height: sprite.height,
                },
                preview.valid ? styles.dropPreviewValid : styles.dropPreviewInvalid,
            ]}
        />
    );
}

const styles = StyleSheet.create({
    placedOverlay: {
        position: 'absolute',
        zIndex: 6,
        elevation: 6,
    },
    placedHighlight: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: 'rgba(255, 215, 0, 0.7)',
        borderRadius: 4,
        backgroundColor: 'rgba(255, 215, 0, 0.08)',
    },
    dropPreview: {
        position: 'absolute',
        borderWidth: 2,
        borderRadius: 5,
        zIndex: 5,
        elevation: 5,
    },
    dropPreviewValid: {
        borderColor: 'rgba(120, 255, 170, 0.95)',
        backgroundColor: 'rgba(120, 255, 170, 0.16)',
    },
    dropPreviewInvalid: {
        borderColor: 'rgba(255, 100, 100, 0.95)',
        backgroundColor: 'rgba(255, 100, 100, 0.14)',
    },
    ghost: {
        position: 'absolute',
        left: 0,
        top: 0,
        opacity: 0.85,
        zIndex: 14,
        elevation: 14,
    },
    editButtonTrashOverlay: {
        position: 'absolute',
        top: 4,
        left: 4,
        right: 4,
        bottom: 4,
        backgroundColor: 'rgba(140, 30, 30, 0.92)',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editButtonTrashOverlayHover: {
        backgroundColor: 'rgba(210, 40, 40, 0.98)',
    },
    trashIconLid: {
        width: 28,
        height: 4,
        backgroundColor: colors.white,
        borderRadius: 1,
        marginBottom: 3,
    },
    trashIconBody: {
        width: 22,
        height: 26,
        borderWidth: 2,
        borderTopWidth: 0,
        borderColor: colors.white,
        borderBottomLeftRadius: 3,
        borderBottomRightRadius: 3,
        alignItems: 'center',
        justifyContent: 'space-evenly',
        paddingVertical: 3,
    },
    trashIconRib: {
        width: 2,
        height: 14,
        backgroundColor: colors.white,
        borderRadius: 1,
    },
    ghostImage: {
        width: '100%',
        height: '100%',
    },
    editButton: {
        position: 'absolute',
        right: 16,
        zIndex: 10,
        elevation: 10,
        padding: 4,
    },
    editButtonImage: {
        width: 60,
        height: 65,
    },
    editButtonActiveTint: {
        position: 'absolute',
        top: 4,
        left: 4,
        right: 4,
        bottom: 4,
        backgroundColor: 'rgba(168, 93, 0, 0.45)',
        borderRadius: 8,
    },
    paletteWrap: {
        position: 'absolute',
        zIndex: 11,
        elevation: 11,
    },
    paletteFrame: {
        backgroundColor: 'transparent',
        borderRadius: 6,
        // Inset so the scrollable strip sits inside the cream area of
        // invbutton1 — without this, the first/last palette item passes
        // under the painted brown border on scroll.
        marginTop: 2,
        marginBottom: 10,
        marginHorizontal: 8,
        overflow: 'hidden',
    },
    paletteBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: undefined,
        height: undefined,
    },
    paletteContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 6,
        gap: 5,
    },
    paletteItem: {
        width: 44,
        height: 44,
        backgroundColor: 'rgba(40, 22, 18, 0.55)',
        borderWidth: 2,
        borderColor: 'transparent',
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    paletteImage: {
        width: 34,
        height: 34,
    },
});

export { WALL_GRID, FLOOR_GRID };
export default RoomEditor;
