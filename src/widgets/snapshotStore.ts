import AsyncStorage from '@react-native-async-storage/async-storage';
import { WidgetSnapshot } from './types';

// AsyncStorage key the JS app writes to and the widget task handler reads
// from. Single source of truth for "what should the widget render right now".
const SNAPSHOT_KEY = '@hoshino:widgetSnapshot';

const EMPTY_SNAPSHOT: WidgetSnapshot = {
    characterId: null,
    name: 'No Moonoko',
    avatarKey: 'EMPTY',
    snapshotAt: 0,
};

export async function loadCachedSnapshot(): Promise<WidgetSnapshot> {
    try {
        const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
        if (!raw) return EMPTY_SNAPSHOT;
        const parsed = JSON.parse(raw) as WidgetSnapshot;
        return parsed;
    } catch {
        // Corrupt JSON or storage error — fall back to the empty snapshot
        // rather than letting the widget render error state.
        return EMPTY_SNAPSHOT;
    }
}

export async function saveSnapshot(snapshot: WidgetSnapshot): Promise<void> {
    await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export const EMPTY_WIDGET_SNAPSHOT = EMPTY_SNAPSHOT;
