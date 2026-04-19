import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

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

interface ChromeContextType {
    push: (id: string, config: ChromeConfig) => void;
    pop: (id: string) => void;
    active: ChromeConfig | null;
}

const ChromeContext = createContext<ChromeContextType | null>(null);

export function ChromeProvider({ children }: { children: React.ReactNode }) {
    const [stack, setStack] = useState<StackEntry[]>([]);

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

    const active = stack.length > 0 ? stack[stack.length - 1] : null;

    const value = useMemo(() => ({ push, pop, active }), [push, pop, active]);

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
