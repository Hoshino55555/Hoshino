import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

interface Character {
    id: string;
    name: string;
    image: string;
    element: string;
}

interface Props {
    character: Character;
    foodItem?: string;
    onAnimationComplete: () => void;
    onFoodReaction: (reaction: string) => void;
}

const FeedingAnimation: React.FC<Props> = ({
    character,
    foodItem,
    onAnimationComplete,
    onFoodReaction
}) => {
    const [animationStage, setAnimationStage] = useState<'appearing' | 'sitting' | 'eating' | 'reacting' | 'happy'>('appearing');
    const [showFood, setShowFood] = useState(false);
    const [foodFrame, setFoodFrame] = useState(0);
    const [characterExpression, setCharacterExpression] = useState('neutral');
    const [heartParticles, setHeartParticles] = useState<Array<{ id: number, x: number, y: number, anim: Animated.Value }>>([]);

    const characterOpacity = useRef(new Animated.Value(0)).current;
    const characterTranslateY = useRef(new Animated.Value(100)).current;
    const characterScale = useRef(new Animated.Value(0.5)).current;
    const characterRotate = useRef(new Animated.Value(0)).current;

    const foodOpacity = useRef(new Animated.Value(0)).current;
    const foodScale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animationSequence = async () => {
            // Stage 1: Character appears
            setAnimationStage('appearing');
            await new Promise(resolve => {
                Animated.parallel([
                    Animated.timing(characterOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
                    Animated.timing(characterTranslateY, { toValue: 0, duration: 800, useNativeDriver: true }),
                    Animated.timing(characterScale, { toValue: 1, duration: 800, useNativeDriver: true }),
                ]).start(resolve);
            });

            // Stage 2: Character sits down
            setAnimationStage('sitting');
            await new Promise(resolve => {
                Animated.parallel([
                    Animated.sequence([
                        Animated.timing(characterTranslateY, { toValue: 5, duration: 300, useNativeDriver: true }),
                        Animated.timing(characterTranslateY, { toValue: 0, duration: 300, useNativeDriver: true }),
                    ]),
                    Animated.sequence([
                        Animated.timing(characterScale, { toValue: 1.05, duration: 300, useNativeDriver: true }),
                        Animated.timing(characterScale, { toValue: 1, duration: 300, useNativeDriver: true }),
                    ]),
                ]).start(resolve);
            });

            // Stage 3: Eating
            setAnimationStage('eating');
            setCharacterExpression('excited');

            const eatLoop = Animated.loop(
                Animated.sequence([
                    Animated.timing(characterRotate, { toValue: -2, duration: 250, easing: Easing.ease, useNativeDriver: true }),
                    Animated.timing(characterRotate, { toValue: 2, duration: 500, easing: Easing.ease, useNativeDriver: true }),
                    Animated.timing(characterRotate, { toValue: 0, duration: 250, easing: Easing.ease, useNativeDriver: true }),
                ])
            );
            eatLoop.start();

            setShowFood(true);
            setFoodFrame(1);
            await new Promise(resolve => {
                Animated.parallel([
                    Animated.timing(foodScale, { toValue: 0.6, duration: 200, useNativeDriver: true }),
                    Animated.timing(foodOpacity, { toValue: 0.7, duration: 200, useNativeDriver: true }),
                ]).start(resolve);
            });

            setFoodFrame(2);
            await new Promise(resolve => {
                Animated.parallel([
                    Animated.timing(foodScale, { toValue: 1, duration: 300, useNativeDriver: true }),
                    Animated.timing(foodOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                ]).start(resolve);
            });

            setFoodFrame(3);
            await new Promise(resolve => {
                Animated.parallel([
                    Animated.timing(foodScale, { toValue: 0.4, duration: 200, useNativeDriver: true }),
                    Animated.timing(foodOpacity, { toValue: 0.3, duration: 200, useNativeDriver: true }),
                ]).start(resolve);
            });

            setShowFood(false);
            setFoodFrame(0);
            eatLoop.stop();

            // Stage 4: Reacting
            setAnimationStage('reacting');
            setCharacterExpression('happy');
            generateHeartParticles();

            const reaction = getFoodReaction(character.id, foodItem);
            onFoodReaction(reaction);

            await new Promise(resolve => {
                Animated.sequence([
                    Animated.timing(characterScale, { toValue: 1.15, duration: 750, useNativeDriver: true }),
                    Animated.timing(characterScale, { toValue: 1, duration: 750, useNativeDriver: true }),
                ]).start(resolve);
            });

            // Stage 5: Happy
            setAnimationStage('happy');
            const happyLoop = Animated.loop(
                Animated.sequence([
                    Animated.parallel([
                        Animated.timing(characterTranslateY, { toValue: -5, duration: 500, useNativeDriver: true }),
                        Animated.timing(characterScale, { toValue: 1.05, duration: 500, useNativeDriver: true }),
                    ]),
                    Animated.parallel([
                        Animated.timing(characterTranslateY, { toValue: 0, duration: 500, useNativeDriver: true }),
                        Animated.timing(characterScale, { toValue: 1, duration: 500, useNativeDriver: true }),
                    ]),
                ])
            );
            happyLoop.start();
            await new Promise(resolve => setTimeout(resolve, 1000));
            happyLoop.stop();

            onAnimationComplete();
        };

        animationSequence();
    }, [character, foodItem, onAnimationComplete, onFoodReaction]);

    const generateHeartParticles = () => {
        const particles: Array<{ id: number, x: number, y: number, anim: Animated.Value }> = [];
        for (let i = 0; i < 5; i++) {
            const anim = new Animated.Value(0);
            particles.push({
                id: Date.now() + i,
                x: Math.random() * 100 + 20,
                y: Math.random() * 50 + 30,
                anim,
            });
        }
        setHeartParticles(particles);
        particles.forEach(p => {
            Animated.timing(p.anim, {
                toValue: 1,
                duration: 2000,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
            }).start();
        });
        setTimeout(() => setHeartParticles([]), 2000);
    };

    const getFoodReaction = (characterId: string, food?: string): string => {
        const reactions = {
            lyra: [
                "OMG this is just like in Shokugeki no Soma! 💖😭",
                "This food is making me have anime protagonist feelings! 🌸✨",
                "Wait... is this a love letter written in food form?! 💔🍜",
                "I'm having Food Wars flashbacks! This is SO dramatic! 😤💖"
            ],
            luna: [
                "The celestial flavors align with cosmic harmony... 🌙✨",
                "This nourishment resonates with lunar energy... 🌌",
                "The stars have blessed this meal... ⭐",
                "Ancient wisdom flows through every bite... 🌟"
            ],
            io: [
                "WOW! This is absolutely AMAZING! ✨⭐",
                "I'm literally sparkling with joy! 💫🌟",
                "This food is as bright as a supernova! ⭐✨",
                "My energy is through the STARS! 🌟💫"
            ],
            hoshino: [
                "Across all dimensions, this ranks among the finest... 🌟",
                "The cosmic balance of flavors is remarkable... 🌀",
                "This transcends ordinary sustenance... 🚀",
                "A meal worthy of interdimensional travel... 🔮"
            ],
            aurora: [
                "This radiance matches my own inner light! ✨",
                "Brilliant flavors dance like aurora streams! 🌈",
                "My shield glows brighter with each bite! 💎",
                "Pure luminescence in culinary form! 🌟"
            ]
        };

        const characterReactions = reactions[characterId as keyof typeof reactions] || [
            "Delicious! Thank you for this wonderful meal! 🌟"
        ];

        return characterReactions[Math.floor(Math.random() * characterReactions.length)];
    };

    const getFoodImageAndName = (food?: string): { emoji: string, image?: string, name: string } => {
        const foodData: { [key: string]: { emoji: string, image?: string, name: string } } = {
            'cloud-cake': {
                emoji: '☁️',
                image: '/chunky_bubbly_2.webp',
                name: 'Cloud Cake'
            },
            'dream-bean': { emoji: '☁️', name: 'Dream Bean' },
            'nebula-plum': { emoji: '🌌', name: 'Nebula Plum' },
            'starberry': { emoji: '⭐', name: 'Starberry' },
            'ramen': { emoji: '🍜', name: 'Ramen' },
            'bento': { emoji: '🍱', name: 'Bento' },
            'mochi': { emoji: '🍡', name: 'Mochi' },
            'takoyaki': { emoji: '🐙', name: 'Takoyaki' },
            'star_fruit': { emoji: '⭐', name: 'Star Fruit' },
            'cosmic_honey': { emoji: '🍯', name: 'Cosmic Honey' },
            'moon_cake': { emoji: '🥮', name: 'Moon Cake' },
            'default': { emoji: '☁️', name: 'Cosmic Treat' }
        };
        return foodData[food || 'default'] || foodData['default'];
    };

    const foodData = getFoodImageAndName(foodItem);

    return (
        <LinearGradient
            colors={['#4f46e5', '#7c3aed', '#ec4899', '#f59e0b', '#10b981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            locations={[0, 0.25, 0.5, 0.75, 1]}
            style={styles.container}
        >
            <View style={styles.starryBackground}>
                <Text style={[styles.star, styles.star1]}>✦</Text>
                <Text style={[styles.star, styles.star2]}>✧</Text>
                <Text style={[styles.star, styles.star3]}>✦</Text>
                <Text style={[styles.star, styles.star4]}>✧</Text>
                <Text style={[styles.star, styles.star5]}>✦</Text>
                <Text style={[styles.star, styles.star6]}>✧</Text>
                <Text style={[styles.star, styles.star7]}>✦</Text>
                <Text style={[styles.star, styles.star8]}>✧</Text>
            </View>

            <View style={styles.cloud1} />
            <View style={styles.cloud2} />
            <View style={styles.cloud3} />

            <Animated.View
                style={[
                    styles.feedingCharacter,
                    {
                        opacity: characterOpacity,
                        transform: [
                            { translateY: characterTranslateY },
                            { scale: characterScale },
                            {
                                rotate: characterRotate.interpolate({
                                    inputRange: [-2, 0, 2],
                                    outputRange: ['-2deg', '0deg', '2deg'],
                                }),
                            },
                        ],
                    },
                ]}
            >
                <Image
                    source={{ uri: character.image }}
                    style={styles.characterSprite}
                />
                {characterExpression === 'excited' && (
                    <View style={styles.emotionOverlay}>
                        <Text style={[styles.emotionSparkle, styles.emotionSparkle1]}>✨</Text>
                        <Text style={[styles.emotionSparkle, styles.emotionSparkle2]}>✨</Text>
                    </View>
                )}
                {characterExpression === 'happy' && (
                    <View style={styles.emotionOverlay}>
                        <Text style={styles.emotionHeart}>💖</Text>
                    </View>
                )}
            </Animated.View>

            {showFood && (
                <Animated.View
                    style={[
                        styles.foodItem,
                        {
                            opacity: foodOpacity,
                            transform: [{ scale: foodScale }],
                        },
                    ]}
                >
                    {foodData.image ? (
                        <Image
                            source={{ uri: foodData.image }}
                            style={styles.foodImage}
                        />
                    ) : (
                        <Text style={styles.foodEmoji}>{foodData.emoji}</Text>
                    )}
                    <View style={styles.foodSparkles}>
                        <Text style={styles.sparkle}>✨</Text>
                        <Text style={styles.sparkle}>✨</Text>
                        <Text style={styles.sparkle}>✨</Text>
                    </View>
                </Animated.View>
            )}

            {heartParticles.map(particle => (
                <Animated.Text
                    key={particle.id}
                    style={[
                        styles.heartParticle,
                        {
                            left: `${particle.x}%`,
                            top: `${particle.y}%`,
                            opacity: particle.anim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 0],
                            }),
                            transform: [
                                {
                                    translateY: particle.anim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0, -50],
                                    }),
                                },
                                {
                                    scale: particle.anim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0.5, 1],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    💖
                </Animated.Text>
            ))}

            <View style={styles.characterPlatform} />
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        height: 250,
        borderRadius: 12,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    starryBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
    },
    star: {
        position: 'absolute',
        color: '#fbbf24',
        fontSize: 12,
    },
    star1: { top: '10%', left: '15%' },
    star2: { top: '20%', left: '80%' },
    star3: { top: '15%', left: '50%' },
    star4: { top: '30%', left: '25%' },
    star5: { top: '25%', left: '70%' },
    star6: { top: '35%', left: '90%' },
    star7: { top: '40%', left: '10%' },
    star8: { top: '45%', left: '60%' },
    cloud: {
        position: 'absolute',
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 20,
        zIndex: 2,
    },
    cloud1: {
        width: 60,
        height: 20,
        top: '20%',
        left: '20%',
    },
    cloud2: {
        width: 80,
        height: 25,
        top: '30%',
        right: '15%',
    },
    cloud3: {
        width: 50,
        height: 18,
        top: '40%',
        left: '60%',
    },
    feedingCharacter: {
        position: 'relative',
        zIndex: 10,
    },
    characterSprite: {
        width: 80,
        height: 80,
        resizeMode: 'contain',
    },
    emotionOverlay: {
        position: 'absolute',
        top: -20,
        width: 80,
        alignItems: 'center',
        zIndex: 15,
    },
    emotionSparkle: {
        position: 'absolute',
        fontSize: 12,
    },
    emotionSparkle1: {
        left: 15,
    },
    emotionSparkle2: {
        right: 15,
    },
    emotionHeart: {
        fontSize: 16,
    },
    foodItem: {
        position: 'absolute',
        top: '30%',
        right: '35%',
        zIndex: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    foodImage: {
        width: 40,
        height: 40,
        resizeMode: 'contain',
    },
    foodEmoji: {
        fontSize: 32,
    },
    foodSparkles: {
        position: 'absolute',
        top: -10,
        width: 40,
        alignItems: 'center',
    },
    sparkle: {
        fontSize: 8,
    },
    heartParticle: {
        position: 'absolute',
        fontSize: 12,
        zIndex: 20,
    },
    characterPlatform: {
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: [{ translateX: -60 }],
        width: 120,
        height: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 4,
        zIndex: 5,
    },
});

export default FeedingAnimation;