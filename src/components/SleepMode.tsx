import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, TextInput, Switch, StyleSheet, Animated, Easing } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { getCharacterStill } from '../assets';

const getImageSource = (imageName: string) => getCharacterStill(imageName);

interface Character {
    id: string;
    name: string;
    image: string;
    element: string;
}

interface Props {
    character: Character;
    onSleepSessionEnd: (sleepData: SleepSessionData) => void;
    onClose: () => void;
}

interface SleepSessionData {
    duration: number; // in minutes
    score: number; // 0-100
    mood: 'excellent' | 'good' | 'fair' | 'poor';
    dreamLog?: string[];
    energyGain: number;
    moodGain: number;
}

const SleepMode: React.FC<Props> = ({ character, onSleepSessionEnd, onClose }) => {
    const [sessionPhase, setSessionPhase] = useState<'starting' | 'sleeping' | 'summary'>('starting');
    const [sleepStartTime, setSleepStartTime] = useState<Date | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [alarmTime, setAlarmTime] = useState<Date>(() => {
        const now = new Date();
        now.setHours(now.getHours() + 7, now.getMinutes() + 30); // Default +7.5 hours
        return now;
    });
    const [relaxingSoundEnabled, setRelaxingSoundEnabled] = useState(false);
    const [sleepSessionData, setSleepSessionData] = useState<SleepSessionData | null>(null);

    const starTwinkle = useRef(new Animated.Value(0)).current;
    const moonokoScale = useRef(new Animated.Value(1)).current;
    const moonokoTranslateY = useRef(new Animated.Value(0)).current;
    const zFloat1 = useRef(new Animated.Value(0)).current;
    const zFloat2 = useRef(new Animated.Value(0)).current;
    const zFloat3 = useRef(new Animated.Value(0)).current;
    const wakeUpProgress = useRef(new Animated.Value(0)).current;

    const starPositions = useMemo(
        () =>
            [...Array(20)].map(() => ({
                left: `${Math.random() * 100}%` as `${number}%`,
                top: `${Math.random() * 100}%` as `${number}%`,
            })),
        []
    );

    // Update current time every minute
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 60000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (sessionPhase === 'sleeping') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(starTwinkle, { toValue: 1, duration: 1500, useNativeDriver: true, easing: Easing.ease }),
                    Animated.timing(starTwinkle, { toValue: 0, duration: 1500, useNativeDriver: true, easing: Easing.ease }),
                ])
            ).start();

            Animated.loop(
                Animated.sequence([
                            Animated.timing(moonokoScale, { toValue: 1.02, duration: 1500, useNativeDriver: true }),
        Animated.timing(moonokoScale, { toValue: 1, duration: 1500, useNativeDriver: true }),
                ])
            ).start();

            Animated.loop(
                Animated.sequence([
                            Animated.timing(moonokoTranslateY, { toValue: -2, duration: 1500, useNativeDriver: true }),
        Animated.timing(moonokoTranslateY, { toValue: 0, duration: 1500, useNativeDriver: true }),
                ])
            ).start();

            const zAnimation = (value: Animated.Value, delay: number) => {
                setTimeout(() => {
                    Animated.loop(
                        Animated.sequence([
                            Animated.timing(value, { toValue: 1, duration: 1000, useNativeDriver: true }),
                            Animated.timing(value, { toValue: 0, duration: 1000, useNativeDriver: true }),
                        ])
                    ).start();
                }, delay);
            };

            zAnimation(zFloat1, 0);
            zAnimation(zFloat2, 700);
            zAnimation(zFloat3, 1400);
        } else if (sessionPhase === 'summary') {
            Animated.timing(wakeUpProgress, { toValue: 1, duration: 2000, useNativeDriver: true, easing: Easing.ease }).start();
        }
    }, [sessionPhase]);

    // Start sleep session
    const startSleepSession = () => {
        setSleepStartTime(new Date());
        setSessionPhase('sleeping');
    };

    // End sleep session and calculate results
    const endSleepSession = () => {
        if (!sleepStartTime) return;

        const endTime = new Date();
        const durationMs = endTime.getTime() - sleepStartTime.getTime();
        const durationMinutes = Math.floor(durationMs / (1000 * 60));
        const durationHours = durationMinutes / 60;

        // Calculate sleep score based on duration
        let score = 0;
        if (durationHours >= 8) score = 100;
        else if (durationHours >= 7) score = 90;
        else if (durationHours >= 6) score = 75;
        else if (durationHours >= 4) score = 60;
        else if (durationHours >= 2) score = 40;
        else if (durationHours >= 1) score = 25;
        else score = 10;

        // Determine mood based on score
        let mood: 'excellent' | 'good' | 'fair' | 'poor';
        if (score >= 90) mood = 'excellent';
        else if (score >= 75) mood = 'good';
        else if (score >= 50) mood = 'fair';
        else mood = 'poor';

        // Generate dream log for high scores
        const dreamLog = score > 80 ? generateDreamLog() : undefined;

        // Calculate stat gains
        const energyGain = Math.min(5, Math.floor(score / 20));
        const moodGain = Math.min(3, Math.floor(score / 35));

        const sessionData: SleepSessionData = {
            duration: durationMinutes,
            score,
            mood,
            dreamLog,
            energyGain,
            moodGain
        };

        setSleepSessionData(sessionData);
        setSessionPhase('summary');
    };

    const generateDreamLog = (): string[] => {
        const dreamTemplates = {
            lyra: [
                "Dreamed of cooking the perfect ramen in a cosmic kitchen",
                "Floated through a galaxy made of noodles and starlight",
                "Danced with anime characters in a food festival among the stars"
            ],
            luna: [
                "Soared through nebulae on wings of pure moonlight",
                "Conducted a symphony of celestial bodies",
                "Walked through lunar gardens filled with crystal flowers"
            ],
            io: [
                "Raced through asteroid fields leaving trails of sparkles",
                "Discovered new constellations that spelled out adventures",
                "Surfed on comet tails across the cosmos"
            ],
            hoshino: [
                "Traveled between dimensions solving cosmic mysteries",
                "Mediated a peace treaty between rival star systems",
                "Rebalanced the cosmic forces with ancient wisdom"
            ],
            aurora: [
                "Protected dream realms with shields of rainbow light",
                "Healed wounded stars with gentle aurora magic",
                "Created new worlds from pure crystalline energy"
            ]
        };

        const characterDreams = dreamTemplates[character.id as keyof typeof dreamTemplates] || [
            "Had wonderful cosmic adventures",
            "Explored magical realms of starlight",
            "Danced among the constellations"
        ];

        // Return 1-3 random dreams
        const numDreams = Math.floor(Math.random() * 3) + 1;
        const selectedDreams: string[] = [];
        for (let i = 0; i < numDreams; i++) {
            const randomDream = characterDreams[Math.floor(Math.random() * characterDreams.length)];
            if (!selectedDreams.includes(randomDream)) {
                selectedDreams.push(randomDream);
            }
        }
        return selectedDreams;
    };

    const formatTime = (date: Date): string => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDuration = (minutes: number): string => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h ${mins}m`;
    };

    const getMoonokoMoodReaction = (mood: string): string => {
        const reactions = {
            excellent: `😍 ${character.name} feels amazing! Full of cosmic energy!`,
            good: `😊 ${character.name} had great rest and feels refreshed!`,
            fair: `😐 ${character.name} got some rest but could sleep more...`,
            poor: `😴 ${character.name} is still tired... needs more sleep!`
        };
        return reactions[mood as keyof typeof reactions];
    };

    const completeSleepSession = () => {
        if (sleepSessionData) {
            onSleepSessionEnd(sleepSessionData);
        }
        onClose();
    };

    if (sessionPhase === 'starting') {
        return (
            <View style={styles.sleepModeOverlay}>
                <View style={styles.sleepModeContainer}>
                    <LinearGradient
                        colors={['#1a1a2e', '#16213e', '#0f3460', '#533483', '#7c3aed']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.sleepBackground}
                    />
                    <View style={styles.sleepHeader}>
                        <View style={styles.currentTime}>
                            <Text style={styles.currentTimeText}>{formatTime(currentTime)}</Text>
                        </View>
                        <View style={styles.sleepTitle}>
                            <Text style={styles.sleepTitleText}>💤 Sleep Mode</Text>
                        </View>
                    </View>
                                <View style={styles.sleepingMoonokoContainer}>
                                                    <Image source={getImageSource(character.image)} style={styles.sleepingMoonokoImage} />
                        <Text style={styles.sleepPrompt}>Tap "Start Sleep Session" to begin</Text>
                    </View>
                    <View style={styles.sleepSettings}>
                        <View style={styles.alarmSetting}>
                            <Text style={styles.label}>Alarm Time:</Text>
                            <TextInput
                                style={styles.alarmInput}
                                value={alarmTime.toTimeString().slice(0, 5)}
                                onChangeText={(text) => {
                                    if (text.match(/^\d{2}:\d{2}$/)) {
                                        const [hours, minutes] = text.split(':').map(Number);
                                        const newAlarmTime = new Date();
                                        newAlarmTime.setHours(hours, minutes, 0, 0);
                                        setAlarmTime(newAlarmTime);
                                    }
                                }}
                                placeholder="HH:MM"
                                keyboardType="numeric"
                                maxLength={5}
                            />
                        </View>
                        <View style={styles.soundSetting}>
                            <Text style={styles.label}>Relaxing sounds</Text>
                            <Switch value={relaxingSoundEnabled} onValueChange={setRelaxingSoundEnabled} />
                        </View>
                    </View>
                    <TouchableOpacity style={styles.startSleepBtn} onPress={startSleepSession} activeOpacity={0.7}>
                        <LinearGradient
                            colors={['#4c1d95', '#7c3aed']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.btnGradient}
                        >
                            <Text style={styles.btnText}>💤 Start Sleep Session</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (sessionPhase === 'sleeping') {
        const sleepDuration = sleepStartTime
            ? Math.floor((currentTime.getTime() - sleepStartTime.getTime()) / (1000 * 60))
            : 0;

        return (
            <View style={styles.sleepModeOverlay}>
                <View style={styles.sleepModeContainer}>
                    <LinearGradient
                        colors={['#0f0f23', '#1a1a3a', '#2d1b47', '#3b1e54', '#4c1d95']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.sleepBackground}
                    >
                        <View style={styles.sleepStars}>
                            {[...Array(20)].map((_, i) => (
                                <Animated.Text
                                    key={i}
                                    style={[
                                        styles.star,
                                        {
                                            left: starPositions[i].left,
                                            top: starPositions[i].top,
                                            opacity: starTwinkle.interpolate({
                                                inputRange: [0, 0.5, 1],
                                                outputRange: [0.3, 1, 0.3],
                                            }),
                                            transform: [
                                                {
                                                    scale: starTwinkle.interpolate({
                                                        inputRange: [0, 0.5, 1],
                                                        outputRange: [1, 1.2, 1],
                                                    }),
                                                },
                                            ],
                                        },
                                    ]}
                                >
                                    ✦
                                </Animated.Text>
                            ))}
                        </View>
                    </LinearGradient>
                    <View style={styles.sleepHeader}>
                        <View style={styles.currentTime}>
                            <Text style={styles.currentTimeText}>{formatTime(currentTime)}</Text>
                        </View>
                        <View style={styles.recordingSleep}>
                            <Text style={styles.recordingSleepText}>🔴 Recording Sleep</Text>
                        </View>
                    </View>
                    <View style={styles.sleepingMoonokoContainer}>
                        <Animated.Image
                            source={getImageSource(character.image)}
                            style={[
                                styles.sleepingMoonokoImage,
                                {
                                    transform: [{ scale: moonokoScale }, { translateY: moonokoTranslateY }],
                                },
                            ]}
                        />
                        <View style={styles.sleepZzz}>
                            <Animated.Text
                                style={[
                                    styles.z,
                                    styles.z1,
                                    {
                                        opacity: zFloat1.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1, 0.7] }),
                                        transform: [
                                            {
                                                translateY: zFloat1.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -15, 0] }),
                                            },
                                            {
                                                rotate: zFloat1.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '10deg', '0deg'] }),
                                            },
                                        ],
                                    },
                                ]}
                            >
                                Z
                            </Animated.Text>
                            <Animated.Text
                                style={[
                                    styles.z,
                                    styles.z2,
                                    {
                                        opacity: zFloat2.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1, 0.7] }),
                                        transform: [
                                            {
                                                translateY: zFloat2.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -15, 0] }),
                                            },
                                            {
                                                rotate: zFloat2.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '10deg', '0deg'] }),
                                            },
                                        ],
                                    },
                                ]}
                            >
                                z
                            </Animated.Text>
                            <Animated.Text
                                style={[
                                    styles.z,
                                    styles.z3,
                                    {
                                        opacity: zFloat3.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1, 0.7] }),
                                        transform: [
                                            {
                                                translateY: zFloat3.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -15, 0] }),
                                            },
                                            {
                                                rotate: zFloat3.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '10deg', '0deg'] }),
                                            },
                                        ],
                                    },
                                ]}
                            >
                                z
                            </Animated.Text>
                        </View>
                        <Text style={styles.sleepDuration}>Sleeping for {formatDuration(sleepDuration)}</Text>
                    </View>
                    <View style={styles.alarmDisplay}>
                        <Text style={styles.alarmTime}>⏰ Alarm: {formatTime(alarmTime)}</Text>
                        {relaxingSoundEnabled && <Text style={styles.soundIndicator}>🎵 Relaxing sounds playing</Text>}
                    </View>
                    <TouchableOpacity style={styles.endSleepBtn} onPress={endSleepSession} activeOpacity={0.7}>
                        <LinearGradient
                            colors={['#dc2626', '#ef4444']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.btnGradient}
                        >
                            <Text style={styles.btnText}>⏰ End Sleep Session</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (sessionPhase === 'summary' && sleepSessionData) {
        return (
            <View style={styles.sleepModeOverlay}>
                <View style={styles.sleepModeContainer}>
                    <View style={styles.sleepSummaryCard}>
                        <Text style={styles.summaryTitle}>💤 Sleep Summary</Text>
                        <View style={styles.sleepStats}>
                            <LinearGradient
                                colors={['#4c1d95', '#7c3aed']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.scoreCircle}
                            >
                                <Text style={styles.scoreNumber}>{sleepSessionData.score}</Text>
                                <Text style={styles.scoreLabel}>Score</Text>
                            </LinearGradient>
                            <View style={styles.sleepDetails}>
                                <View style={styles.statItem}>
                                    <Text style={styles.statLabel}>Duration:</Text>
                                    <Text style={styles.statValue}>{formatDuration(sleepSessionData.duration)}</Text>
                                </View>
                                <View style={styles.statItem}>
                                    <Text style={styles.statLabel}>Energy gained:</Text>
                                    <Text style={styles.statValue}>+{sleepSessionData.energyGain}</Text>
                                </View>
                                <View style={styles.statItem}>
                                    <Text style={styles.statLabel}>Mood bonus:</Text>
                                    <Text style={styles.statValue}>+{sleepSessionData.moodGain}</Text>
                                </View>
                            </View>
                        </View>
                        <View style={styles.moonokoReaction}>
                            <Animated.Image
                                source={getImageSource(character.image)}
                                style={[
                                    styles.reactionMoonokoImage,
                                    {
                                        transform: [
                                            {
                                                scale: wakeUpProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.1, 1] }),
                                            },
                                            {
                                                rotate: wakeUpProgress.interpolate({
                                                    inputRange: [0, 0.5, 1],
                                                    outputRange: ['0deg', '-5deg', '0deg'],
                                                }),
                                            },
                                        ],
                                    },
                                ]}
                            />
                            <Text style={styles.reactionText}>{getMoonokoMoodReaction(sleepSessionData.mood)}</Text>
                        </View>
                        {sleepSessionData.dreamLog && (
                            <LinearGradient
                                colors={['#ede9fe', '#ddd6fe']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.dreamLog}
                            >
                                <Text style={styles.dreamLogTitle}>✨ Dream Journal</Text>
                                <View style={styles.dreamEntries}>
                                    {sleepSessionData.dreamLog.map((dream, index) => (
                                        <View key={index} style={styles.dreamEntry}>
                                            <Text style={styles.dreamEntryText}>🌙 {dream}</Text>
                                        </View>
                                    ))}
                                </View>
                            </LinearGradient>
                        )}
                        <TouchableOpacity style={styles.completeSleepBtn} onPress={completeSleepSession} activeOpacity={0.7}>
                            <LinearGradient
                                colors={['#059669', '#10b981']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.btnGradient}
                            >
                                <Text style={styles.btnText}>✨ Wake Up!</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    }

    return null;
};

const styles = StyleSheet.create({
    sleepModeOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 25,
        overflow: 'hidden',
    },
    sleepModeContainer: {
        width: '100%',
        height: '100%',
        position: 'relative',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 20,
    },
    sleepBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.9,
    },
    sleepStars: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    star: {
        position: 'absolute',
        color: '#fbbf24',
        fontSize: 8,
    },
    sleepHeader: {
        position: 'relative',
        zIndex: 10,
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
        fontSize: 10,
    },
    currentTime: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    currentTimeText: {
        color: 'white',
    },
    sleepTitle: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    sleepTitleText: {
        color: 'white',
    },
    recordingSleep: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    recordingSleepText: {
        color: 'white',
    },
    sleepingMoonokoContainer: {
        position: 'relative',
        zIndex: 10,
        flexDirection: 'column',
        alignItems: 'center',
        marginVertical: 40,
    },
    sleepingMoonokoImage: {
        width: 120,
        height: 120,
        marginBottom: 20,
    },
    sleepPrompt: {
        color: '#e2e8f0',
        fontSize: 8,
        textAlign: 'center',
        marginTop: 10,
    },
    sleepDuration: {
        color: '#e2e8f0',
        fontSize: 8,
        textAlign: 'center',
        marginTop: 10,
    },
    sleepSettings: {
        position: 'relative',
        zIndex: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 12,
        padding: 20,
        marginVertical: 20,
        fontSize: 8,
    },
    alarmSetting: {
        marginBottom: 15,
        flexDirection: 'row',
        alignItems: 'center',
    },
    soundSetting: {
        marginBottom: 15,
        flexDirection: 'row',
        alignItems: 'center',
    },
    label: {
        color: 'white',
        marginRight: 10,
    },
    alarmInput: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: '#4a5568',
        borderRadius: 4,
        paddingVertical: 4,
        paddingHorizontal: 8,
        color: 'white',
        fontSize: 8,
    },
    startSleepBtn: {
        position: 'relative',
        zIndex: 10,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 24,
        fontSize: 10,
        marginTop: 20,
        overflow: 'hidden',
        width: 'auto',
    },
    endSleepBtn: {
        position: 'relative',
        zIndex: 10,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 24,
        fontSize: 10,
        marginTop: 20,
        overflow: 'hidden',
        width: 'auto',
    },
    completeSleepBtn: {
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 24,
        fontSize: 10,
        marginTop: 20,
        overflow: 'hidden',
        width: 'auto',
    },
    btnGradient: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnText: {
        color: 'white',
    },
    sleepZzz: {
        position: 'absolute',
        top: -30,
        right: -20,
    },
    z: {
        position: 'absolute',
        fontSize: 14,
        color: '#fbbf24',
        fontWeight: 'bold',
    },
    z1: {
        right: 0,
        fontSize: 16,
    },
    z2: {
        right: 15,
        top: -10,
        fontSize: 12,
    },
    z3: {
        right: 30,
        top: -20,
        fontSize: 10,
    },
    alarmDisplay: {
        position: 'relative',
        zIndex: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 12,
        padding: 15,
        marginVertical: 20,
        fontSize: 8,
        textAlign: 'center',
    },
    alarmTime: {
        color: 'white',
    },
    soundIndicator: {
        marginTop: 8,
        color: '#48bb78',
    },
    sleepSummaryCard: {
        position: 'relative',
        zIndex: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 20,
        padding: 30,
        maxWidth: 600,
        width: '90%',
        maxHeight: '90%',
        overflow: 'scroll',
        textAlign: 'center',
    },
    summaryTitle: {
        marginBottom: 20,
        color: '#4c1d95',
        fontSize: 14,
    },
    sleepStats: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 25,
    },
    scoreCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreNumber: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
    },
    scoreLabel: {
        fontSize: 8,
        color: 'white',
    },
    sleepDetails: {
        flexDirection: 'column',
        fontSize: 8,
    },
    statItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        minWidth: 150,
    },
    statLabel: {
        color: '#2d3748',
    },
    statValue: {
        color: '#059669',
        fontWeight: 'bold',
    },
    moonokoReaction: {
        backgroundColor: '#f7fafc',
        borderRadius: 12,
        padding: 20,
        marginVertical: 20,
        flexDirection: 'column',
        alignItems: 'center',
    },
    reactionMoonokoImage: {
        width: 60,
        height: 60,
    },
    reactionText: {
        fontSize: 10,
        textAlign: 'center',
        color: '#4a5568',
        lineHeight: 14,
    },
    dreamLog: {
        borderRadius: 12,
        padding: 20,
        marginVertical: 20,
        alignItems: 'center',
    },
    dreamLogTitle: {
        marginBottom: 15,
        fontSize: 10,
        color: '#6b21a8',
    },
    dreamEntries: {
        flexDirection: 'column',
    },
    dreamEntry: {
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
    },
    dreamEntryText: {
        fontSize: 8,
        lineHeight: 10.4,
        color: '#4a5568',
    },
});

export default SleepMode;