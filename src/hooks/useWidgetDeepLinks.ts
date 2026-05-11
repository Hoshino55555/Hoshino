import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import type { AppView, PendingWidgetAction } from '../types/AppTypes';
import { pushEmptySnapshot } from '../widgets/widgetService';

interface UseWidgetDeepLinksArgs {
    selectedCharacterId?: string | null;
    profileSettled: boolean;
    replaceView: (view: AppView) => void;
}

export function useWidgetDeepLinks({
    selectedCharacterId,
    profileSettled,
    replaceView,
}: UseWidgetDeepLinksArgs) {
    const [pendingWidgetAction, setPendingWidgetAction] =
        useState<PendingWidgetAction | null>(null);
    const [pendingWidgetRoute, setPendingWidgetRoute] = useState<{
        view: Extract<AppView, 'feeding'>;
        characterId: string;
    } | null>(null);
    // Dedupe empty pushes: launcher redraws are coalesced, but pushing an
    // empty widget snapshot on every render would still spam native IPC.
    const emptyPushedForSessionRef = useRef(false);

    const clearPendingWidgetAction = useCallback(() => {
        setPendingWidgetAction(null);
    }, []);

    // Deep-link router for widget taps and external launches.
    // Supported URI:
    //   hoshino://forage/drain?characterId=ABC
    //   hoshino://route/feeding?characterId=ABC
    useEffect(() => {
        const handleUrl = (url: string | null) => {
            if (!url) return;
            try {
                const parsed = new URL(url);
                if (parsed.hostname === 'forage' && parsed.pathname === '/drain') {
                    const characterId = parsed.searchParams.get('characterId');
                    if (!characterId) return;

                    replaceView('interaction');
                    setPendingWidgetAction({
                        type: 'forage-drain',
                        characterId,
                        setAt: Date.now(),
                    });
                    return;
                }

                if (parsed.hostname === 'route' && parsed.pathname === '/feeding') {
                    const characterId = parsed.searchParams.get('characterId');
                    if (!characterId) return;

                    setPendingWidgetRoute({
                        view: 'feeding',
                        characterId,
                    });
                }
            } catch {
                // Malformed URI. Ignore rather than crash; the widget only
                // emits known schemes, so this only fires on hand-crafted links.
            }
        };

        void Linking.getInitialURL().then(handleUrl);
        const sub = Linking.addEventListener('url', (event) =>
            handleUrl(event.url)
        );

        return () => sub.remove();
    }, [replaceView]);

    // Drop pending widget action if the active character does not match the
    // one the tap was bound to. Gated on profileSettled so a cold-start widget
    // tap survives the hydrate window, when selectedCharacterId is temporarily
    // null before profile restore finishes.
    useEffect(() => {
        if (!pendingWidgetAction) return;
        if (!profileSettled) return;
        if (
            !selectedCharacterId ||
            selectedCharacterId !== pendingWidgetAction.characterId
        ) {
            setPendingWidgetAction(null);
        }
    }, [selectedCharacterId, pendingWidgetAction, profileSettled]);

    useEffect(() => {
        if (!pendingWidgetRoute) return;
        if (!profileSettled) return;
        if (
            !selectedCharacterId ||
            selectedCharacterId !== pendingWidgetRoute.characterId
        ) {
            setPendingWidgetRoute(null);
            return;
        }

        replaceView(pendingWidgetRoute.view);
        setPendingWidgetRoute(null);
    }, [pendingWidgetRoute, profileSettled, replaceView, selectedCharacterId]);

    // Clear the home-screen widget when the profile has settled with no active
    // character (fresh install, profile reset, wallet disconnect, or cold start
    // into an empty account). Re-arm when a character becomes active again.
    useEffect(() => {
        if (!profileSettled) return;
        if (selectedCharacterId) {
            emptyPushedForSessionRef.current = false;
            return;
        }
        if (emptyPushedForSessionRef.current) return;
        pushEmptySnapshot().catch(() => {});
        emptyPushedForSessionRef.current = true;
    }, [profileSettled, selectedCharacterId]);

    return {
        pendingWidgetAction,
        clearPendingWidgetAction,
    };
}
