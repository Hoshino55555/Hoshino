import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { GestureResponderEvent } from 'react-native';

export interface ChromeConfig {
    leftButtonText?: string;
    centerButtonText?: string;
    rightButtonText?: string;
    leftButtonDisabled?: boolean;
    centerButtonDisabled?: boolean;
    rightButtonDisabled?: boolean;
    onLeftButtonPress?: () => void;
    onCenterButtonPress?: () => void;
    onRightButtonPress?: () => void;
    overlayMode?: boolean;
}

interface StackEntry extends ChromeConfig {
    id: string;
}

export type ButtonSlot = 'left' | 'center' | 'right';

interface ChromeContextType {
    push: (id: string, config: ChromeConfig) => void;
    pop: (id: string) => void;
    active: ChromeConfig | null;
    pressFrame: number;
    pressIn: (slot: ButtonSlot) => void;
    pressOut: (slot: ButtonSlot) => void;
    // Subscribe to a "two-finger hold for HOLD_BOTH_MS" gesture. Returns an
    // unsubscribe function. Used by App.tsx for the demo shortcut that
    // re-enters the welcome flow. Detection runs on the bottom-button
    // container's raw onTouchStart/End instead of the buttons' pressIn —
    // simultaneous press-in across two TouchableOpacity targets is flaky
    // on Android, but the container's raw touch events fire reliably.
    onHoldBoth: (cb: () => void) => () => void;
    // Wire onto the bottom-button container View so it can count active
    // pointers and feed the hold-both detector.
    holdBothTouchHandlers: {
        onTouchStart: (e: GestureResponderEvent) => void;
        onTouchEnd: (e: GestureResponderEvent) => void;
        onTouchCancel: (e: GestureResponderEvent) => void;
    };
}

const HOLD_BOTH_MS = 1000;

const ChromeContext = createContext<ChromeContextType | null>(null);

// Press peak frames in the Bottoni sprite (1–18 left, 19–36 center, 37–54
// right; frame 1 == 54 == idle). On press we jump straight to the peak so
// the press is instant; on release we walk through 3 release frames back to
// idle for the spring-up animation. Each release frame is its own setTimeout
// (not setInterval) so React renders each one — fast intervals coalesce when
// the JS thread is busy.
const PRESS_PEAK: Record<ButtonSlot, number> = {
    left: 9,
    center: 27,
    right: 45,
};
const RELEASE_FRAMES: Record<ButtonSlot, number[]> = {
    left: [13, 16, 1],
    center: [31, 34, 1],
    right: [49, 52, 1],
};
const RELEASE_STEP_MS = 50;

export function ChromeProvider({ children }: { children: React.ReactNode }) {
    const [stack, setStack] = useState<StackEntry[]>([]);
    const [pressFrame, setPressFrame] = useState(1);
    const push = useCallback((id: string, config: ChromeConfig) => {
        setStack(prev => {
            const existing = prev.findIndex(x => x.id === id);
            if (existing >= 0) {
                const next = [...prev];
                next[existing] = { id, ...config };
                return next;
            }
            return [...prev, { id, ...config }];
        });
    }, []);

    const pop = useCallback((id: string) => {
        setStack(prev => prev.filter(x => x.id !== id));
    }, []);

    const releaseTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

    const cancelRelease = useCallback(() => {
        releaseTimeouts.current.forEach(clearTimeout);
        releaseTimeouts.current = [];
    }, []);

    // Hold-both gesture state. activeTouchesRef counts how many pointers
    // are currently down on the bottom-button container. holdBothTimerRef
    // is the pending HOLD_BOTH_MS timer; if 2+ pointers stay down for the
    // full duration the registered listener fires. Counting pointers via
    // the container's raw onTouchStart/End instead of the buttons'
    // pressIn/Out is necessary because simultaneous press-in across two
    // sibling TouchableOpacity targets is unreliable on Android — only
    // one button often grabs the responder for both fingers.
    const activeTouchesRef = useRef(0);
    const holdBothTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const holdBothListenerRef = useRef<(() => void) | null>(null);

    const evaluateHoldBoth = useCallback(() => {
        const enoughDown = activeTouchesRef.current >= 2;
        if (enoughDown && !holdBothTimerRef.current) {
            holdBothTimerRef.current = setTimeout(() => {
                holdBothTimerRef.current = null;
                holdBothListenerRef.current?.();
            }, HOLD_BOTH_MS);
        } else if (!enoughDown && holdBothTimerRef.current) {
            clearTimeout(holdBothTimerRef.current);
            holdBothTimerRef.current = null;
        }
    }, []);

    const onHoldBoth = useCallback((cb: () => void) => {
        holdBothListenerRef.current = cb;
        return () => {
            if (holdBothListenerRef.current === cb) {
                holdBothListenerRef.current = null;
            }
        };
    }, []);

    const handleContainerTouchStart = useCallback(
        (e: GestureResponderEvent) => {
            const count = e.nativeEvent.touches?.length ?? 0;
            activeTouchesRef.current = count;
            evaluateHoldBoth();
        },
        [evaluateHoldBoth]
    );

    const handleContainerTouchEnd = useCallback(
        (e: GestureResponderEvent) => {
            const count = e.nativeEvent.touches?.length ?? 0;
            activeTouchesRef.current = count;
            evaluateHoldBoth();
        },
        [evaluateHoldBoth]
    );

    const holdBothTouchHandlers = useMemo(
        () => ({
            onTouchStart: handleContainerTouchStart,
            onTouchEnd: handleContainerTouchEnd,
            onTouchCancel: handleContainerTouchEnd,
        }),
        [handleContainerTouchStart, handleContainerTouchEnd]
    );

    const pressIn = useCallback((slot: ButtonSlot) => {
        cancelRelease();
        setPressFrame(PRESS_PEAK[slot]);
    }, [cancelRelease]);

    const pressOut = useCallback((slot: ButtonSlot) => {
        cancelRelease();
        const frames = RELEASE_FRAMES[slot];
        frames.forEach((frame, idx) => {
            const handle = setTimeout(() => {
                setPressFrame(frame);
            }, (idx + 1) * RELEASE_STEP_MS);
            releaseTimeouts.current.push(handle);
        });
    }, [cancelRelease]);

    useEffect(() => {
        return () => {
            cancelRelease();
            if (holdBothTimerRef.current) {
                clearTimeout(holdBothTimerRef.current);
                holdBothTimerRef.current = null;
            }
        };
    }, [cancelRelease]);

    const active = stack.length > 0 ? stack[stack.length - 1] : null;

    const value = useMemo(
        () => ({
            push,
            pop,
            active,
            pressFrame,
            pressIn,
            pressOut,
            onHoldBoth,
            holdBothTouchHandlers,
        }),
        [
            push,
            pop,
            active,
            pressFrame,
            pressIn,
            pressOut,
            onHoldBoth,
            holdBothTouchHandlers,
        ]
    );

    return (
        <ChromeContext.Provider value={value}>
            {children}
        </ChromeContext.Provider>
    );
}

export function useChrome() {
    const ctx = useContext(ChromeContext);
    if (!ctx) throw new Error('useChrome must be used within ChromeProvider');
    return ctx;
}

export function useChromeConfig(config: ChromeConfig) {
    const ctx = useContext(ChromeContext);
    const idRef = useRef<string | null>(null);
    if (!idRef.current) {
        idRef.current = Math.random().toString(36).substring(2);
    }
    const handlersRef = useRef(config);
    handlersRef.current = config;

    useEffect(() => {
        if (!ctx) return;
        ctx.push(idRef.current!, {
            leftButtonText: config.leftButtonText,
            centerButtonText: config.centerButtonText,
            rightButtonText: config.rightButtonText,
            leftButtonDisabled: config.leftButtonDisabled,
            centerButtonDisabled: config.centerButtonDisabled,
            rightButtonDisabled: config.rightButtonDisabled,
            overlayMode: config.overlayMode,
            onLeftButtonPress: () => handlersRef.current.onLeftButtonPress?.(),
            onCenterButtonPress: () => handlersRef.current.onCenterButtonPress?.(),
            onRightButtonPress: () => handlersRef.current.onRightButtonPress?.(),
        });
    }, [
        config.leftButtonText,
        config.centerButtonText,
        config.rightButtonText,
        config.leftButtonDisabled,
        config.centerButtonDisabled,
        config.rightButtonDisabled,
        config.overlayMode,
    ]);

    useEffect(() => {
        return () => {
            if (ctx) ctx.pop(idRef.current!);
        };
    }, []);
}
