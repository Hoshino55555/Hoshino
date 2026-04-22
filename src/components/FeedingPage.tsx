import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated, Easing, ImageBackground } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ZoomOutOverlay from './ZoomOutOverlay';
import { useGameStateContext } from '../contexts/GameStateContext';

interface FoodItem {
    id: string;
    name: string;
    hungerBoost: number;
    moodBoost: number;
}

interface Props {
    onBack: () => void;
    onNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const RECIPE_IMAGE = require('../../assets/images/recipe-example.png');

const FOOD_ITEMS: FoodItem[] = Array.from({ length: 8 }, (_, i) => ({
    id: `recipe-${i + 1}`,
    name: `Recipe ${i + 1}`,
    hungerBoost: 1,
    moodBoost: 1,
}));

const FeedingPage = ({ onBack, onNotification }: Props) => {
    const { state, feed } = useGameStateContext();
    const currentHunger = state?.hunger ?? 5;
    const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
    const [feedingAnimation, setFeedingAnimation] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const bounceAnim = useRef(new Animated.Value(0)).current;
    const insets = useSafeAreaInsets();

    useEffect(() => {
        if (feedingAnimation) {
            const animation = Animated.loop(
                Animated.sequence([
                    Animated.timing(bounceAnim, {
                        toValue: -20,
                        duration: 500,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(bounceAnim, {
                        toValue: 0,
                        duration: 500,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            );
            animation.start();
            return () => animation.stop();
        }
    }, [feedingAnimation]);

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
    };

    const handleFeed = (food: FoodItem) => {
        if (currentHunger >= 5) return;

        setSelectedFood(food);
        setFeedingAnimation(true);

        setTimeout(async () => {
            try {
                await feed(food.hungerBoost, food.moodBoost);
            } catch (e: any) {
                onNotification?.(e?.message || 'Failed to feed', 'error');
            }
            setFeedingAnimation(false);
            setSelectedFood(null);
        }, 1500);
    };

    const full = currentHunger >= 5;

    return (
        <ZoomOutOverlay exiting={isClosing} onExitComplete={onBack} backgroundColor="#1a1033">
            <ImageBackground
                source={require('../../assets/images/cooking-bg.png')}
                style={styles.bg}
                resizeMode="cover"
            >
                <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleClose}
                        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    >
                        <Text style={styles.backButtonText}>{'<'} Back</Text>
                    </TouchableOpacity>
                </View>

                <View style={[styles.gridWrap, { paddingBottom: insets.bottom + 16 }]}>
                    <View style={styles.grid}>
                        {FOOD_ITEMS.map((food) => {
                            const isSelected = selectedFood?.id === food.id;
                            return (
                                <TouchableOpacity
                                    key={food.id}
                                    style={[
                                        styles.card,
                                        isSelected && styles.cardSelected,
                                        full && styles.cardDisabled,
                                    ]}
                                    onPress={() => !full && handleFeed(food)}
                                    activeOpacity={full ? 1 : 0.7}
                                >
                                    <Image
                                        source={RECIPE_IMAGE}
                                        style={styles.cardImage}
                                        resizeMode="contain"
                                    />
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {full && <Text style={styles.fullText}>TOO FULL TO EAT</Text>}
                </View>

                {feedingAnimation && selectedFood && (
                    <View style={styles.feedingOverlay}>
                        <Animated.Image
                            source={RECIPE_IMAGE}
                            style={[
                                styles.feedingImage,
                                { transform: [{ translateY: bounceAnim }] },
                            ]}
                            resizeMode="contain"
                        />
                        <Text style={styles.feedingText}>
                            Feeding {selectedFood.name}...
                        </Text>
                    </View>
                )}
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
    topBar: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: 'rgba(46, 90, 62, 0.85)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#E8F5E8',
    },
    backButtonText: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 10,
    },
    gridWrap: {
        flex: 1,
        justifyContent: 'flex-end',
        paddingHorizontal: 12,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    card: {
        width: '46%',
        aspectRatio: 4 / 3,
        margin: '2%',
        borderRadius: 8,
        overflow: 'hidden',
    },
    cardSelected: {
        borderWidth: 2,
        borderColor: '#E8B84A',
    },
    cardDisabled: {
        opacity: 0.5,
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    fullText: {
        marginTop: 18,
        textAlign: 'center',
        fontSize: 12,
        color: '#fff',
        fontFamily: 'PressStart2P',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    feedingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    feedingImage: {
        width: 240,
        height: 180,
    },
    feedingText: {
        color: '#FFD700',
        fontSize: 12,
        fontFamily: 'PressStart2P',
        marginTop: 14,
        textAlign: 'center',
    },
});

export default FeedingPage;
