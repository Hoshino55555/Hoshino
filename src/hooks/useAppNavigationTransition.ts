import { useCallback, useEffect, useRef, useState } from 'react';

export type TransitionPhase = 'idle' | 'closing' | 'covered' | 'opening';

interface AppNavigationTransition<View extends string> {
    currentView: View;
    previousView: View;
    transitionPhase: TransitionPhase;
    replaceView: (view: View) => void;
    transitionTo: (view: View) => void;
    navigateToView: (view: View) => void;
    handleIrisClosed: () => void;
    handleIrisOpened: () => void;
}

const COVERED_HOLD_MS = 200;

export function useAppNavigationTransition<View extends string>(
    initialView: View,
): AppNavigationTransition<View> {
    const [currentView, setCurrentView] = useState<View>(initialView);
    const [previousView, setPreviousView] = useState<View>(initialView);
    const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('idle');

    const pendingViewRef = useRef<View | null>(null);
    const coverRafRef = useRef<number | null>(null);
    const coverHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentViewRef = useRef(currentView);
    const transitionPhaseRef = useRef<TransitionPhase>('idle');

    useEffect(() => {
        currentViewRef.current = currentView;
    }, [currentView]);

    useEffect(() => {
        transitionPhaseRef.current = transitionPhase;
    }, [transitionPhase]);

    const transitionTo = useCallback((view: View) => {
        if (transitionPhaseRef.current !== 'idle') return;
        if (view === currentViewRef.current) return;
        pendingViewRef.current = view;
        setTransitionPhase('closing');
    }, []);

    const replaceView = useCallback((view: View) => {
        currentViewRef.current = view;
        setCurrentView(view);
    }, []);

    const navigateToView = useCallback((view: View) => {
        setPreviousView(currentViewRef.current);
        currentViewRef.current = view;
        setCurrentView(view);
    }, []);

    const handleIrisClosed = useCallback(() => {
        const next = pendingViewRef.current;
        pendingViewRef.current = null;
        if (next != null) {
            setPreviousView(currentViewRef.current);
            currentViewRef.current = next;
            setCurrentView(next);
        }
        setTransitionPhase('covered');
    }, []);

    const handleIrisOpened = useCallback(() => {
        setTransitionPhase((p) => (p === 'opening' ? 'idle' : p));
    }, []);

    useEffect(() => {
        if (transitionPhase !== 'covered') return;
        const id1 = requestAnimationFrame(() => {
            coverRafRef.current = requestAnimationFrame(() => {
                coverRafRef.current = null;
                coverHoldRef.current = setTimeout(() => {
                    coverHoldRef.current = null;
                    setTransitionPhase('opening');
                }, COVERED_HOLD_MS);
            });
        });
        return () => {
            cancelAnimationFrame(id1);
            if (coverRafRef.current != null) {
                cancelAnimationFrame(coverRafRef.current);
                coverRafRef.current = null;
            }
            if (coverHoldRef.current != null) {
                clearTimeout(coverHoldRef.current);
                coverHoldRef.current = null;
            }
        };
    }, [transitionPhase]);

    return {
        currentView,
        previousView,
        transitionPhase,
        replaceView,
        transitionTo,
        navigateToView,
        handleIrisClosed,
        handleIrisOpened,
    };
}
