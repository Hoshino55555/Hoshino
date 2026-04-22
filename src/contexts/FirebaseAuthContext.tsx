import React, { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
import { usePrivy, getAccessToken } from '@privy-io/expo';
import { auth } from '../config/firebase';
import { GameStateService } from '../services/GameStateService';

interface FirebaseAuthContextType {
    firebaseUid: string | null;
    ready: boolean;
    error: string | null;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextType>({
    firebaseUid: null,
    ready: false,
    error: null,
});

interface ProviderProps {
    children: ReactNode;
}

export const FirebaseAuthProvider: React.FC<ProviderProps> = ({ children }) => {
    const { user } = usePrivy();
    const [firebaseUser, setFirebaseUser] = useState<User | null>(() => auth.currentUser);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const exchangedForPrivyIdRef = useRef<string | null>(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            setFirebaseUser(u);
            setReady(true);
        });
        return unsub;
    }, []);

    useEffect(() => {
        const privyId: string | undefined = user?.id;

        // Privy logged out → sign out Firebase.
        if (!privyId) {
            exchangedForPrivyIdRef.current = null;
            if (auth.currentUser) {
                signOut(auth).catch((e) => console.warn('Firebase signOut failed:', e));
            }
            return;
        }

        // Already signed into Firebase as this Privy user → nothing to do.
        if (firebaseUser && firebaseUser.uid === privyId) {
            exchangedForPrivyIdRef.current = privyId;
            return;
        }

        // Avoid retry loops on transient errors.
        if (exchangedForPrivyIdRef.current === privyId) return;
        exchangedForPrivyIdRef.current = privyId;

        (async () => {
            try {
                const token = await getAccessToken();
                if (!token) throw new Error('No Privy access token available');
                const { firebaseToken } = await GameStateService.exchangePrivyToken(token);
                await signInWithCustomToken(auth, firebaseToken);
                setError(null);
            } catch (e: any) {
                console.warn('Privy→Firebase exchange failed:', e?.message || e);
                setError(e?.message || 'Auth bridge failed');
                exchangedForPrivyIdRef.current = null; // allow retry on next render
            }
        })();
    }, [user, firebaseUser]);

    const value = useMemo<FirebaseAuthContextType>(
        () => ({
            firebaseUid: firebaseUser?.uid ?? null,
            ready,
            error,
        }),
        [firebaseUser, ready, error]
    );

    return <FirebaseAuthContext.Provider value={value}>{children}</FirebaseAuthContext.Provider>;
};

export const useFirebaseAuth = () => useContext(FirebaseAuthContext);
