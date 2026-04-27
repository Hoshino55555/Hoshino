import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    Image,
    StyleSheet,
    Animated,
    Dimensions,
} from 'react-native';
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
    onAnimationComplete: () => void;
    onSleepStart: () => void;
}

const SleepAnimation: React.FC<Props> = ({
    character,
    onAnimationComplete,
    onSleepStart,
}) => {
    const [animationStage, setAnimationStage] = useState<'appearing' | 'yawning' | 'sleeping' | 'dreaming'>('appearing');
    const [showZzz, setShowZzz] = useState(false);
    const [dreamBubbles, setDreamBubbles] = useState<Array<{ id: number; x: number; y: number; content: string }>>([]);

    const zAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const runZAnim = () => {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(zAnim, {
                        toValue: -15,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(zAnim, {
                        toValue: 0,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        };

        const animationSequence = async () => {
            setAnimationStage('appearing');
            await delay(800);

            setAnimationStage('yawning');
            await delay(1200);

            setAnimationStage('sleeping');
            setShowZzz(true);
            onSleepStart();
            runZAnim();
            await delay(1000);

            setAnimationStage('dreaming');
            generateDreamBubbles();
            await delay(2000);

            onAnimationComplete();
        };

        animationSequence();
    }, [character]);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const generateDreamBubbles = () => {
        const dreamContents = ['🍜', '⭐', '🌙', '✨', '🎮', '🍰', '🌈', '🚀', '🎨', '🎵'];
        const bubbles = [];
        for (let i = 0; i < 6; i++) {
            bubbles.push({
                id: Date.now() + i,
                x: Math.random() * 80 + 10,
                y: Math.random() * 60 + 20,
                content: dreamContents[Math.floor(Math.random() * dreamContents.length)],
            });
        }
        setDreamBubbles(bubbles);

        setTimeout(() => setDreamBubbles([]), 3000);
    };

    const getSleepMessage = (): string => {
        const messages = {
            lyra: [
                "Zzz... dreaming of the perfect ramen bowl... 🍜",
                "Sleeping like an anime protagonist after a big meal... 😴",
                "Zzz... Food Wars battle in my dreams... 💤",
            ],
            luna: [
                "Zzz... floating among the stars... ⭐",
                "Sleeping in cosmic harmony... 🌙",
                "Zzz... lunar energy flowing through dreams... ✨",
            ],
            io: [
                "Zzz... sparkling dreams of adventure... ✨",
                "Sleeping with starry energy... ⭐",
                "Zzz... supernova dreams... 🌟",
            ],
            hoshino: [
                "Zzz... interdimensional dreams... 🌀",
                "Sleeping across all dimensions... 🚀",
                "Zzz... cosmic balance in slumber... 🔮",
            ],
            aurora: [
                "Zzz... aurora dreams flowing... 🌈",
                "Sleeping with inner light glowing... ✨",
                "Zzz... shield protecting my dreams... 💎",
            ],
        };

        const characterMessages =
            messages[character.id as keyof typeof messages] || ["Zzz... sweet dreams... 💤"];

        return characterMessages[Math.floor(Math.random() * characterMessages.length)];
    };

    return (
        <View style={styles.container}>
            {/* Night Sky */}
            <View style={styles.background}>
                <Text style={styles.moon}>🌙</Text>
                <Text style={[styles.star, { top: 10, left: 20 }]}>✦</Text>
                <Text style={[styles.star, { top: 25, right: 30 }]}>✧</Text>
                <Text style={[styles.star, { top: 50, left: 70 }]}>✦</Text>
                <Text style={[styles.star, { top: 60, right: 10 }]}>✧</Text>
            </View>

            {/* Character */}
            <View style={styles.characterWrapper}>
                                    <Image source={getImageSource(character.image)} style={styles.characterSprite} />
                {showZzz && (
                    <Animated.View style={[styles.zzz, { transform: [{ translateY: zAnim }] }]}>
                        <Text style={styles.zText}>Z</Text>
                        <Text style={styles.zText}>z</Text>
                        <Text style={styles.zText}>z</Text>
                    </Animated.View>
                )}
            </View>

            {/* Dream Bubbles */}
            {dreamBubbles.map(bubble => (
                <Text
                    key={bubble.id}
                    style={[
                        styles.bubble,
                        {
                            left: `${bubble.x}%`,
                            top: `${bubble.y}%`,
                        },
                    ]}
                >
                    {bubble.content}
                </Text>
            ))}

            {/* Message */}
            <View style={styles.sleepMessage}>
                <Text style={styles.sleepMessageText}>{getSleepMessage()}</Text>
            </View>

            {/* Platform */}
            <View style={styles.platform} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        height: 250,
        borderRadius: 12,
        backgroundColor: '#3730a3',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    background: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 0,
    },
    moon: {
        position: 'absolute',
        top: '15%',
        right: '15%',
        fontSize: 24,
    },
    star: {
        position: 'absolute',
        fontSize: 10,
        color: '#fbbf24',
    },
    characterWrapper: {
        zIndex: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    characterSprite: {
        width: 80,
        height: 80,
        resizeMode: 'contain',
        opacity: 0.8,
    },
    zzz: {
        position: 'absolute',
        top: -30,
        right: -20,
        flexDirection: 'row',
    },
    zText: {
        fontSize: 16,
        color: '#fbbf24',
        fontWeight: 'bold',
        marginHorizontal: 2,
    },
    bubble: {
        position: 'absolute',
        fontSize: 14,
        zIndex: 1,
    },
    sleepMessage: {
        position: 'absolute',
        bottom: 60,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
        zIndex: 3,
    },
    sleepMessageText: {
        fontSize: 12,
        color: '#fff',
    },
    platform: {
        position: 'absolute',
        bottom: 20,
        width: 120,
        height: 8,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 50,
        zIndex: 0,
    },
});

export default SleepAnimation;
