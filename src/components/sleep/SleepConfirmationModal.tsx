import React, { useState, useEffect, useRef } from 'react';
import { colors, fonts } from '../../styles/tokens';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Modal,
    useWindowDimensions,
} from 'react-native';

const DIGIT_ROW_HEIGHT = 56;
const DIGIT_FONT_SIZE = 38;
const DIGIT_BOX_MIN_WIDTH = 92;
const ROLL_DURATION_MS = 180;

interface RollingDigitProps {
    value: string;
    direction: 1 | -1;
    textStyle: any;
}

const RollingDigit: React.FC<RollingDigitProps> = ({ value, direction, textStyle }) => {
    const [snapshot, setSnapshot] = useState<{
        shown: string;
        incoming: string | null;
        dir: 1 | -1;
    }>({ shown: value, incoming: null, dir: 1 });
    const anim = useRef(new Animated.Value(0)).current;
    const lastValue = useRef(value);
    const animationRef = useRef<Animated.CompositeAnimation | null>(null);
    const tokenRef = useRef(0);

    useEffect(() => {
        if (value === lastValue.current) return;
        const old = lastValue.current;
        lastValue.current = value;
        if (animationRef.current) {
            animationRef.current.stop();
        }
        const myToken = ++tokenRef.current;
        setSnapshot({ shown: old, incoming: value, dir: direction });
        anim.setValue(0);
        const a = Animated.timing(anim, {
            toValue: 1,
            duration: ROLL_DURATION_MS,
            useNativeDriver: true,
        });
        animationRef.current = a;
        a.start(({ finished }) => {
            if (!finished || myToken !== tokenRef.current) return;
            setSnapshot({ shown: value, incoming: null, dir: direction });
        });
    }, [value, direction, anim]);

    if (snapshot.incoming === null) {
        return (
            <View style={styles.digitWindow}>
                <Text style={textStyle} numberOfLines={1}>
                    {snapshot.shown}
                </Text>
            </View>
        );
    }

    const shownY = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -snapshot.dir * DIGIT_ROW_HEIGHT],
    });
    const incomingY = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [snapshot.dir * DIGIT_ROW_HEIGHT, 0],
    });

    return (
        <View style={styles.digitWindow}>
            <Animated.Text
                numberOfLines={1}
                style={[textStyle, styles.rollingLayer, { transform: [{ translateY: shownY }] }]}
            >
                {snapshot.shown}
            </Animated.Text>
            <Animated.Text
                numberOfLines={1}
                style={[textStyle, styles.rollingLayer, { transform: [{ translateY: incomingY }] }]}
            >
                {snapshot.incoming}
            </Animated.Text>
        </View>
    );
};

interface Character {
    id: string;
    name: string;
    description: string;
    image: string;
    nftMint?: string | null;
}

interface Props {
    visible: boolean;
    character: Character | null;
    playerName?: string;
    defaultWakeAtMs: number;
    onConfirm: (wakeAtMs: number) => void;
    onCancel: () => void;
    onSmokeTest?: () => void;
}

const MIN_OFFSET_MS = 5 * 60 * 1000;
const MAX_OFFSET_MS = 14 * 60 * 60 * 1000;
const MINUTE_STEP = 5;

interface WakeParts {
    hour12: number;
    minute: number;
    isPM: boolean;
}

const partsFromMs = (ms: number): WakeParts => {
    const d = new Date(ms);
    const h24 = d.getHours();
    const isPM = h24 >= 12;
    let hour12 = h24 % 12;
    if (hour12 === 0) hour12 = 12;
    const minute = Math.floor(d.getMinutes() / MINUTE_STEP) * MINUTE_STEP;
    return { hour12, minute, isPM };
};

const msFromParts = (parts: WakeParts, refMs: number): number => {
    const ref = new Date(refMs);
    let h24 = parts.hour12 % 12;
    if (parts.isPM) h24 += 12;
    const candidate = new Date(
        ref.getFullYear(),
        ref.getMonth(),
        ref.getDate(),
        h24,
        parts.minute,
        0,
        0,
    ).getTime();
    if (candidate < refMs + MIN_OFFSET_MS) return candidate + 24 * 60 * 60 * 1000;
    return candidate;
};

const formatOffset = (ms: number): string => {
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
};

const SleepConfirmationModal: React.FC<Props> = ({
    visible,
    playerName,
    defaultWakeAtMs,
    onConfirm,
    onCancel,
    onSmokeTest,
}) => {
    const { width } = useWindowDimensions();
    const [parts, setParts] = useState<WakeParts>(() => partsFromMs(defaultWakeAtMs));
    const [hourDir, setHourDir] = useState<1 | -1>(1);
    const [minuteDir, setMinuteDir] = useState<1 | -1>(1);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const wasVisibleRef = useRef(false);
    const defaultRef = useRef(defaultWakeAtMs);
    defaultRef.current = defaultWakeAtMs;

    useEffect(() => {
        if (visible && !wasVisibleRef.current) {
            setParts(partsFromMs(defaultRef.current));
        }
        wasVisibleRef.current = visible;
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 120,
                    friction: 6,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            fadeAnim.setValue(0);
            scaleAnim.setValue(0.8);
        }
    }, [visible]);

    const close = (cb: () => void) => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
                toValue: 0.8,
                duration: 150,
                useNativeDriver: true,
            }),
        ]).start(cb);
    };

    const stepHour = (delta: number) => {
        setHourDir(delta > 0 ? 1 : -1);
        setParts((p) => {
            let h = p.hour12 + delta;
            if (h > 12) h = 1;
            if (h < 1) h = 12;
            return { ...p, hour12: h };
        });
    };

    const stepMinute = (delta: number) => {
        setMinuteDir(delta > 0 ? 1 : -1);
        setParts((p) => {
            let m = p.minute + delta * MINUTE_STEP;
            if (m >= 60) m = 0;
            if (m < 0) m = 60 - MINUTE_STEP;
            return { ...p, minute: m };
        });
    };

    const toggleAmPm = () => setParts((p) => ({ ...p, isPM: !p.isPM }));

    if (!visible) return null;

    const now = Date.now();
    let wakeAtMs = msFromParts(parts, now);
    const maxAt = now + MAX_OFFSET_MS;
    if (wakeAtMs > maxAt) wakeAtMs = maxAt;
    const offsetMs = Math.max(0, wakeAtMs - now);
    const greeting = playerName
        ? `GN ${playerName}. See you tomorrow!`
        : 'GN. See you tomorrow!';

    const hourTens = Math.floor(parts.hour12 / 10).toString();
    const hourOnes = (parts.hour12 % 10).toString();
    const minuteTens = Math.floor(parts.minute / 10).toString();
    const minuteOnes = (parts.minute % 10).toString();

    return (
        <Modal transparent visible={visible} animationType="none" onRequestClose={onCancel}>
            <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
                <Animated.View
                    style={[
                        styles.modalContainer,
                        {
                            width: width * 0.85,
                            maxWidth: width * 0.92,
                            transform: [{ scale: scaleAnim }],
                        },
                    ]}
                >
                    <View style={styles.windowHeader}>
                        <Text style={styles.titleText}>SLEEP MODE</Text>
                    </View>

                    <View style={styles.contentArea}>
                        <Text style={styles.messageText}>{greeting}</Text>

                        <Text style={styles.pickerLabel}>WAKE AT</Text>

                        <View style={styles.clockRow}>
                            <View style={styles.column}>
                                <TouchableOpacity
                                    style={styles.arrowBtn}
                                    onPress={() => stepHour(1)}
                                    activeOpacity={0.6}
                                    hitSlop={10}
                                >
                                    <Text style={styles.arrowText}>▲</Text>
                                </TouchableOpacity>
                                <View style={[styles.digitBox, styles.digitBoxMinute]}>
                                    <RollingDigit
                                        value={hourTens}
                                        direction={hourDir}
                                        textStyle={styles.digitText}
                                    />
                                    <RollingDigit
                                        value={hourOnes}
                                        direction={hourDir}
                                        textStyle={styles.digitText}
                                    />
                                </View>
                                <TouchableOpacity
                                    style={styles.arrowBtn}
                                    onPress={() => stepHour(-1)}
                                    activeOpacity={0.6}
                                    hitSlop={10}
                                >
                                    <Text style={styles.arrowText}>▼</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.colon}>:</Text>

                            <View style={styles.column}>
                                <TouchableOpacity
                                    style={styles.arrowBtn}
                                    onPress={() => stepMinute(1)}
                                    activeOpacity={0.6}
                                    hitSlop={10}
                                >
                                    <Text style={styles.arrowText}>▲</Text>
                                </TouchableOpacity>
                                <View style={[styles.digitBox, styles.digitBoxMinute]}>
                                    <RollingDigit
                                        value={minuteTens}
                                        direction={minuteDir}
                                        textStyle={styles.digitText}
                                    />
                                    <RollingDigit
                                        value={minuteOnes}
                                        direction={minuteDir}
                                        textStyle={styles.digitText}
                                    />
                                </View>
                                <TouchableOpacity
                                    style={styles.arrowBtn}
                                    onPress={() => stepMinute(-1)}
                                    activeOpacity={0.6}
                                    hitSlop={10}
                                >
                                    <Text style={styles.arrowText}>▼</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.ampmColumn}>
                                <TouchableOpacity
                                    style={[
                                        styles.ampmBtn,
                                        !parts.isPM && styles.ampmBtnActive,
                                    ]}
                                    onPress={toggleAmPm}
                                    activeOpacity={0.7}
                                >
                                    <Text
                                        style={[
                                            styles.ampmText,
                                            !parts.isPM && styles.ampmTextActive,
                                        ]}
                                    >
                                        AM
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.ampmBtn,
                                        parts.isPM && styles.ampmBtnActive,
                                    ]}
                                    onPress={toggleAmPm}
                                    activeOpacity={0.7}
                                >
                                    <Text
                                        style={[
                                            styles.ampmText,
                                            parts.isPM && styles.ampmTextActive,
                                        ]}
                                    >
                                        PM
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Text style={styles.pickerOffset}>in {formatOffset(offsetMs)}</Text>

                        <View style={styles.buttonContainer}>
                            <TouchableOpacity
                                style={[styles.button, styles.noButton]}
                                onPress={() => close(onCancel)}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.buttonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.button, styles.yesButton]}
                                onPress={() => close(() => onConfirm(wakeAtMs))}
                                activeOpacity={0.8}
                                testID="sleep-confirm"
                            >
                                <Text style={styles.buttonText}>Sleep</Text>
                            </TouchableOpacity>
                        </View>

                        {__DEV__ && onSmokeTest ? (
                            <TouchableOpacity
                                style={styles.smokeBtn}
                                onPress={() => close(onSmokeTest)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.smokeText}>DEV · test alarm 60s</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContainer: {
        backgroundColor: '#e5dcf5',
        borderRadius: 4,
        borderWidth: 3,
        borderColor: colors.black,
        shadowColor: colors.black,
        shadowOffset: { width: 3, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 0,
        elevation: 15,
    },
    windowHeader: {
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#c6d6f2',
        borderBottomWidth: 2,
        borderBottomColor: colors.black,
    },
    titleText: {
        fontSize: 12,
        color: colors.purpleText,
        fontFamily: fonts.pixel,
        letterSpacing: 1,
    },
    contentArea: {
        padding: 20,
        alignItems: 'center',
    },
    messageText: {
        fontSize: 11,
        color: colors.purpleText,
        textAlign: 'center',
        fontFamily: fonts.pixel,
        marginBottom: 16,
    },
    pickerLabel: {
        fontSize: 8,
        color: colors.purpleMid,
        fontFamily: fonts.pixel,
        letterSpacing: 1,
        marginBottom: 10,
    },
    clockRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    column: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    arrowBtn: {
        paddingVertical: 10,
        paddingHorizontal: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.black,
        backgroundColor: '#c6d6f2',
        borderRadius: 4,
        minWidth: 92,
        marginVertical: 2,
    },
    arrowText: {
        fontSize: 18,
        color: colors.purpleText,
        lineHeight: 18,
    },
    digitBox: {
        borderWidth: 2,
        borderColor: colors.black,
        backgroundColor: '#fffaf2',
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minWidth: DIGIT_BOX_MIN_WIDTH,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 4,
    },
    digitBoxMinute: {
        flexDirection: 'row',
    },
    digitWindow: {
        height: DIGIT_ROW_HEIGHT,
        overflow: 'hidden',
        minWidth: 38,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rollingLayer: {
        position: 'absolute',
        left: 0,
        right: 0,
        textAlign: 'center',
    },
    digitText: {
        fontSize: DIGIT_FONT_SIZE,
        lineHeight: DIGIT_ROW_HEIGHT,
        color: colors.purpleText,
        fontFamily: fonts.pixel,
        textAlign: 'center',
        textAlignVertical: 'center',
        includeFontPadding: false,
    },
    colon: {
        fontSize: DIGIT_FONT_SIZE,
        color: colors.purpleText,
        fontFamily: fonts.pixel,
        marginHorizontal: 8,
        includeFontPadding: false,
    },
    ampmColumn: {
        marginLeft: 14,
        gap: 6,
    },
    ampmBtn: {
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderWidth: 2,
        borderColor: colors.black,
        backgroundColor: '#fffaf2',
        borderRadius: 4,
        minWidth: 48,
        alignItems: 'center',
    },
    ampmBtnActive: {
        backgroundColor: '#8ee2d9',
    },
    ampmText: {
        fontSize: 10,
        color: colors.purpleMid,
        fontFamily: fonts.pixel,
        letterSpacing: 1,
    },
    ampmTextActive: {
        color: colors.purpleText,
    },
    pickerOffset: {
        fontSize: 9,
        color: colors.purpleMid,
        fontFamily: fonts.pixel,
        marginBottom: 14,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    button: {
        paddingVertical: 10,
        paddingHorizontal: 22,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: colors.black,
        minWidth: 90,
        alignItems: 'center',
        shadowColor: colors.black,
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 0,
        elevation: 6,
    },
    noButton: { backgroundColor: '#a8a8e0' },
    yesButton: { backgroundColor: '#8ee2d9' },
    buttonText: {
        fontSize: 11,
        color: colors.purpleText,
        fontFamily: fonts.pixel,
        letterSpacing: 1,
    },
    smokeBtn: {
        marginTop: 14,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: colors.purpleMid,
        borderRadius: 4,
        backgroundColor: 'transparent',
    },
    smokeText: {
        fontSize: 7,
        color: colors.purpleMid,
        fontFamily: fonts.pixel,
        letterSpacing: 1,
    },
});

export default SleepConfirmationModal;
