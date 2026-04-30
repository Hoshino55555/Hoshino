import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ImageBackground,
    Image,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ZoomOutOverlay from './ZoomOutOverlay';
import { Backgrounds, Sleep, getCharacterSleep } from '../assets';

const SLEEP_REQUIRED_MS = 8 * 60 * 60 * 1000;

// Deterministic pixel widths for the alarm box and wake button. Earlier
// attempts to size these with `width: '%'` + `aspectRatio` produced
// off-center rendering on Android (the wake button's <Image> was falling
// back to source-intrinsic dimensions despite the parent constraint, so
// it visibly extended past the alarm box on the right while their lefts
// aligned). Computing the box geometry from screen width up-front and
// driving width + height as plain numbers removes the percentage-vs-
// intrinsic ambiguity.
const SCREEN_W = Dimensions.get('window').width;
const ALARM_BOX_WIDTH = Math.round(SCREEN_W * 0.85);
const ALARM_BOX_HEIGHT = Math.round((ALARM_BOX_WIDTH * 240) / 896);
const WAKE_BUTTON_WIDTH = Math.round(SCREEN_W * 0.8);
const WAKE_BUTTON_HEIGHT = Math.round((WAKE_BUTTON_WIDTH * 223) / 855);

interface Props {
    onWake: () => void;
    // Parent can request a wake (e.g. menu sleep button tapped a second time)
    // and SleepScreen will run the same exit animation as the in-screen Wake
    // button. Without this, parent setState used to unmount us instantly,
    // skipping the zoom-out and reading as a stuck transition.
    wakeRequested?: boolean;
    /** Selected moonoko id — drives the sleep pose + the "[NAME] IS SLEEPING…" header. */
    characterId?: string | null;
    /** Server's sleepStartedAt — used to compute the displayed alarm time. */
    sleepStartedAt?: number | null;
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
}) => {
    const insets = useSafeAreaInsets();
    const [isClosing, setIsClosing] = useState(false);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (wakeRequested && !isClosing) {
            setIsClosing(true);
        }
    }, [wakeRequested, isClosing]);

    // Tick the clock once a minute. setInterval rather than every second to
    // avoid pointless re-renders — the displayed time only has minute
    // resolution.
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60 * 1000);
        return () => clearInterval(id);
    }, []);

    const handleWake = () => {
        if (isClosing) return;
        setIsClosing(true);
    };

    const displayName = (characterId || 'MOONOKO').toUpperCase();
    const clockText = formatTime(now);
    // Engine wakes at sleepStartedAt + 8h. Show that as the read-only alarm
    // until the picker (and variable wake-time enforcement) lands.
    const alarmText = sleepStartedAt
        ? formatTime(sleepStartedAt + SLEEP_REQUIRED_MS)
        : '7:00 AM';

    return (
        <ZoomOutOverlay
            exiting={isClosing}
            onExitComplete={onWake}
            backgroundColor="#1a2547"
        >
            <ImageBackground
                source={Backgrounds.sleep}
                style={styles.bg}
                resizeMode="cover"
            >
                <View style={[styles.header, { paddingTop: insets.top + 64 }]}>
                    <Text style={styles.clock}>{clockText}</Text>
                    <Text style={styles.subtitle}>{displayName} IS SLEEPING...</Text>
                </View>

                <View style={styles.stage}>
                    <View style={styles.pillowContainer}>
                        <Image
                            source={Sleep.pillow}
                            style={styles.pillow}
                            resizeMode="contain"
                        />
                        <Image
                            source={getCharacterSleep(characterId)}
                            style={styles.character}
                            resizeMode="contain"
                        />
                    </View>
                </View>

                <View style={styles.alarmWrap}>
                    <ImageBackground
                        source={Sleep.alarmBox}
                        style={styles.alarmBg}
                        resizeMode="stretch"
                    >
                        <View style={styles.alarmContent}>
                            <Text style={styles.alarmLabel}>Alarm</Text>
                            <Text style={styles.alarmTime}>{alarmText}</Text>
                        </View>
                    </ImageBackground>
                </View>

                <View style={[styles.footer, { paddingBottom: insets.bottom + 56 }]}>
                    <TouchableOpacity
                        onPress={handleWake}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        activeOpacity={0.85}
                        style={styles.wakeTouchable}
                    >
                        <Image
                            source={Sleep.wakeupButton}
                            style={styles.wakeImage}
                            resizeMode="contain"
                        />
                    </TouchableOpacity>
                </View>
            </ImageBackground>
        </ZoomOutOverlay>
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
        marginBottom: 48,
    },
    alarmBg: {
        width: ALARM_BOX_WIDTH,
        height: ALARM_BOX_HEIGHT,
    },
    alarmContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 32,
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
        width: WAKE_BUTTON_WIDTH,
        height: WAKE_BUTTON_HEIGHT,
        alignSelf: 'center',
    },
    wakeImage: {
        width: WAKE_BUTTON_WIDTH,
        height: WAKE_BUTTON_HEIGHT,
    },
});

export default SleepScreen;
