import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ImageBackground,
    Image,
    useWindowDimensions,
} from 'react-native';
import type { ImageStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backgrounds, Sleep, getCharacterSleep } from '../../assets';

const SLEEP_REQUIRED_MS = 8 * 60 * 60 * 1000;

interface Props {
    onWake: () => void;
    // Parent can request a wake (e.g. menu sleep button tapped a second time)
    // and SleepScreen will run the same exit animation as the in-screen Wake
    // button. Without this, parent setState used to unmount us instantly,
    // skipping the zoom-out and reading as a stuck transition.
    wakeRequested?: boolean;
    /** Selected moonoko id — drives the sleep pose + the "[NAME] IS SLEEPING…" header. */
    characterId?: string | null;
    /** Server's sleepStartedAt — used as fallback to compute alarm time. */
    sleepStartedAt?: number | null;
    /** Wake time picked by the user; overrides the default 8h calculation. */
    wakeAtMs?: number | null;
}

function formatTime(ms: number): string {
    const d = new Date(ms);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    const mm = m < 10 ? `0${m}` : `${m}`;
    return `${h}:${mm} ${ampm}`;
}

const SleepScreen: React.FC<Props> = ({
    onWake,
    wakeRequested = false,
    characterId,
    sleepStartedAt,
    wakeAtMs,
}) => {
    const insets = useSafeAreaInsets();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const alarmBoxWidth = screenWidth * 0.85;
    const alarmBoxHeight = alarmBoxWidth * (240 / 896);
    const wakeButtonWidth = screenWidth * 0.8;
    const wakeButtonHeight = wakeButtonWidth * (223 / 855);
    const [now, setNow] = useState(Date.now());

    // Parent (SleepController) sets wakeRequested when something other than
    // the in-screen Wake button initiates the wake (menu sleep tap while
    // already sleeping, alarm-driven foreground, etc.). Both paths converge
    // on the same onWake call so the App-level iris runs once.
    useEffect(() => {
        if (wakeRequested) {
            onWake();
        }
    }, [wakeRequested, onWake]);

    // Tick the clock once a minute. setInterval rather than every second to
    // avoid pointless re-renders — the displayed time only has minute
    // resolution.
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60 * 1000);
        return () => clearInterval(id);
    }, []);

    const handleWake = () => {
        onWake();
    };

    const displayName = (characterId || 'MOONOKO').toUpperCase();
    const clockText = formatTime(now);
    const alarmText = wakeAtMs
        ? formatTime(wakeAtMs)
        : sleepStartedAt
            ? formatTime(sleepStartedAt + SLEEP_REQUIRED_MS)
            : '7:00 AM';

    return (
        <View style={StyleSheet.absoluteFill}>
            <ImageBackground
                source={Backgrounds.sleep}
                style={styles.bg}
                resizeMode="cover"
                testID="sleep-screen"
            >
                <View style={[styles.header, { paddingTop: insets.top + 64 }]}>
                    <Text style={styles.clock}>{clockText}</Text>
                    <Text style={styles.subtitle}>{displayName} IS SLEEPING...</Text>
                </View>

                <View style={styles.stage}>
                    <View style={styles.pillowContainer}>
                        <Image
                            source={Sleep.pillow}
                            style={styles.pillow as ImageStyle}
                            resizeMode="contain"
                        />
                        <Image
                            source={getCharacterSleep(characterId)}
                            style={styles.character as ImageStyle}
                            resizeMode="contain"
                        />
                    </View>
                </View>

                <View style={[styles.alarmWrap, { marginBottom: screenHeight * 0.057 }]}>
                    <ImageBackground
                        source={Sleep.alarmBox}
                        style={[
                            styles.alarmBg,
                            { width: alarmBoxWidth, height: alarmBoxHeight },
                        ]}
                        resizeMode="stretch"
                    >
                        <View
                            style={[
                                styles.alarmContent,
                                {
                                    paddingHorizontal: alarmBoxWidth * 0.036,
                                    transform: [
                                        { translateX: alarmBoxWidth * 0.009 },
                                        { translateY: alarmBoxHeight * 0.012 },
                                    ],
                                },
                            ]}
                        >
                            <Text style={styles.alarmLabel}>Alarm</Text>
                            <Text style={styles.alarmTime}>{alarmText}</Text>
                        </View>
                    </ImageBackground>
                </View>

                <View style={[styles.footer, { paddingBottom: insets.bottom + screenHeight * 0.066 }]}>
                    <TouchableOpacity
                        onPress={handleWake}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        activeOpacity={0.85}
                        style={[
                            styles.wakeTouchable,
                            { width: wakeButtonWidth, height: wakeButtonHeight },
                        ]}
                        testID="sleep-wake-button"
                    >
                        <Image
                            source={Sleep.wakeupButton}
                            style={[
                                styles.wakeImage,
                                { width: wakeButtonWidth, height: wakeButtonHeight },
                            ] as ImageStyle}
                            resizeMode="contain"
                        />
                    </TouchableOpacity>
                </View>
            </ImageBackground>
        </View>
    );
};

const styles = StyleSheet.create({
    bg: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    header: {
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    clock: {
        fontFamily: '04b03',
        fontSize: 64,
        color: '#FFFFFF',
        letterSpacing: 2,
    },
    subtitle: {
        fontFamily: '04b03',
        fontSize: 18,
        color: '#FFFFFF',
        marginTop: 6,
        letterSpacing: 1,
    },
    stage: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pillowContainer: {
        width: '102%',
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pillow: {
        position: 'absolute',
        bottom: '8%',
        width: '95%',
        height: '60%',
    },
    character: {
        // Lowered into the pillow's lavender surface — at bottom:32% the
        // sleeping pose floated above the painted pillow, breaking the
        // "lying on the cushion" read.
        position: 'absolute',
        bottom: '14%',
        width: '75%',
        height: '65%',
    },
    alarmWrap: {
        width: '100%',
        alignItems: 'center',
    },
    alarmBg: {
    },
    alarmContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    alarmLabel: {
        fontFamily: '04b03',
        fontSize: 22,
        color: '#FFFFFF',
    },
    alarmTime: {
        fontFamily: '04b03',
        fontSize: 24,
        color: '#FFFFFF',
        letterSpacing: 1,
        // Visually centered in the painted pill on the right side of the
        // box; the box art reserves roughly the right third for the pill.
        // Extra paddingRight pulls the text further left into the pill.
        paddingRight: 24,
    },
    footer: {
        alignItems: 'center',
    },
    wakeTouchable: {
        alignSelf: 'center',
    },
    wakeImage: {
    },
});

export default SleepScreen;
