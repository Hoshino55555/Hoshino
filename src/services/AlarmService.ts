import { Platform } from 'react-native';
import notifee, {
    AndroidCategory,
    AndroidImportance,
    AndroidNotificationSetting,
    AuthorizationStatus,
    TimestampTrigger,
    TriggerType,
} from '@notifee/react-native';

const SLEEP_ALARM_ID = 'hoshino-sleep-alarm';
const SLEEP_CHANNEL_ID = 'hoshino-sleep';

let channelEnsured = false;

async function ensureChannel(): Promise<void> {
    if (Platform.OS !== 'android' || channelEnsured) return;
    await notifee.createChannel({
        id: SLEEP_CHANNEL_ID,
        name: 'Sleep alarms',
        importance: AndroidImportance.HIGH,
        sound: 'default',
        vibration: true,
    });
    channelEnsured = true;
}

export async function requestAlarmPermissions(): Promise<{
    notifications: boolean;
    exactAlarm: boolean;
}> {
    const settings = await notifee.requestPermission();
    const notifications =
        settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
        settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;

    let exactAlarm = true;
    if (Platform.OS === 'android') {
        const s = await notifee.getNotificationSettings();
        exactAlarm = s.android.alarm === AndroidNotificationSetting.ENABLED;
    }
    return { notifications, exactAlarm };
}

export async function scheduleSleepAlarm(
    triggerAtMs: number,
    characterName?: string,
): Promise<{ ok: boolean; reason?: string }> {
    if (triggerAtMs <= Date.now() + 5_000) {
        return { ok: false, reason: 'wake-time-too-soon' };
    }

    try {
        await ensureChannel();
        const perms = await requestAlarmPermissions();
        if (!perms.notifications) {
            return { ok: false, reason: 'notifications-denied' };
        }

        const trigger: TimestampTrigger = {
            type: TriggerType.TIMESTAMP,
            timestamp: triggerAtMs,
            alarmManager: perms.exactAlarm
                ? { allowWhileIdle: true }
                : undefined,
        };

        const title = characterName ? `${characterName} woke up` : 'Time to wake up';
        const body = 'Tap to check on them.';

        await notifee.cancelTriggerNotification(SLEEP_ALARM_ID);
        await notifee.createTriggerNotification(
            {
                id: SLEEP_ALARM_ID,
                title,
                body,
                android: {
                    channelId: SLEEP_CHANNEL_ID,
                    category: AndroidCategory.ALARM,
                    importance: AndroidImportance.HIGH,
                    smallIcon: 'ic_launcher',
                    pressAction: { id: 'default', launchActivity: 'default' },
                    sound: 'default',
                    autoCancel: true,
                },
            },
            trigger,
        );
        return { ok: true, reason: perms.exactAlarm ? 'exact' : 'inexact' };
    } catch (e: any) {
        return { ok: false, reason: e?.message || 'schedule-failed' };
    }
}

export async function cancelSleepAlarm(): Promise<void> {
    try {
        await notifee.cancelTriggerNotification(SLEEP_ALARM_ID);
    } catch {
        // best-effort; notification may not exist
    }
}
