import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import InnerScreen from './InnerScreen';

interface FoodItem {
    id: string;
    name: string;
    image: string;
    hungerBoost: number;
    moodBoost: number;
    description: string;
}

interface Props {
    onBack: () => void;
    onFeed: (foodType: string, hungerBoost: number, moodBoost: number) => void;
    currentHunger: number;
    onCloseStart?: () => void;
}

const FOOD_ITEMS: FoodItem[] = [
    {
        id: 'sugar',
        name: 'Pink Sugar',
        image: 'Pink Sugar.png',
        hungerBoost: 1,
        moodBoost: 1,
        description: 'Sweet crystalline sugar with a pink hue'
    },
    {
        id: 'nova',
        name: 'Nova Egg',
        image: 'Nova Egg.png',
        hungerBoost: 2,
        moodBoost: 2,
        description: 'A mysterious egg that glows with stellar energy'
    },
    {
        id: 'mira',
        name: 'Mira Berry',
        image: 'Mira Berry.png',
        hungerBoost: 3,
        moodBoost: 3,
        description: 'A rare berry with stellar properties'
    }
];

const getFoodImageSource = (imageName: string) => {
    switch (imageName) {
        case 'Pink Sugar.png':
            return require('../../assets/images/Pink Sugar.png');
        case 'Nova Egg.png':
            return require('../../assets/images/Nova Egg.png');
        case 'Mira Berry.png':
            return require('../../assets/images/Mira Berry.png');
        default:
            return require('../../assets/images/Pink Sugar.png');
    }
};

const FeedingPage = ({ onBack, onFeed, currentHunger, onCloseStart }: Props) => {
    const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
    const [feedingAnimation, setFeedingAnimation] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const bounceAnim = React.useRef(new Animated.Value(0)).current;

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
        onCloseStart?.();
    };

    const handleFeed = (food: FoodItem) => {
        if (currentHunger >= 5) return;

        setSelectedFood(food);
        setFeedingAnimation(true);

        setTimeout(() => {
            onFeed(food.name, food.hungerBoost, food.moodBoost);
            setFeedingAnimation(false);
            setSelectedFood(null);
        }, 1500);
    };

    const full = currentHunger >= 5;

    return (
        <InnerScreen
            expanded
            animateIn
            exiting={isClosing}
            onExitComplete={onBack}
            showBackgroundImage={false}
            showStatsBar={false}
            leftButtonText=""
            centerButtonText=""
            rightButtonText=""
            onLeftButtonPress={handleClose}
        >
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.headerText}>MENU</Text>
                </View>

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
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardHeaderText} numberOfLines={1}>
                                        {food.name}
                                    </Text>
                                </View>
                                <View style={styles.cardBody}>
                                    <Image
                                        source={getFoodImageSource(food.image)}
                                        style={styles.foodImage}
                                    />
                                </View>
                                <View style={styles.cardFooter}>
                                    <Text style={styles.effectText}>+{food.hungerBoost} HUNGER</Text>
                                    <Text style={styles.effectText}>+{food.moodBoost} MOOD</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {full && (
                    <Text style={styles.fullText}>TOO FULL TO EAT</Text>
                )}

                {feedingAnimation && selectedFood && (
                    <View style={styles.feedingOverlay}>
                        <Animated.Image
                            source={getFoodImageSource(selectedFood.image)}
                            style={[
                                styles.feedingImage,
                                { transform: [{ translateY: bounceAnim }] },
                            ]}
                        />
                        <Text style={styles.feedingText}>
                            Feeding {selectedFood.name}...
                        </Text>
                    </View>
                )}
            </View>
        </InnerScreen>
    );
};

const styles = StyleSheet.create({
    content: {
        flex: 1,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    header: {
        alignSelf: 'center',
        backgroundColor: '#F4B6A4',
        paddingVertical: 6,
        paddingHorizontal: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#2E5A3E',
        marginBottom: 10,
    },
    headerText: {
        fontSize: 14,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    card: {
        width: '46%',
        margin: '2%',
        backgroundColor: '#F5F9EC',
        borderWidth: 2,
        borderColor: '#2E5A3E',
        borderRadius: 6,
        overflow: 'hidden',
    },
    cardSelected: {
        borderColor: '#E8B84A',
        backgroundColor: '#FFF6D6',
    },
    cardDisabled: {
        opacity: 0.5,
    },
    cardHeader: {
        backgroundColor: '#BEE3C4',
        paddingVertical: 4,
        paddingHorizontal: 6,
        alignItems: 'center',
    },
    cardHeaderText: {
        fontSize: 8,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
    },
    cardBody: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
    },
    foodImage: {
        width: 48,
        height: 48,
        resizeMode: 'contain',
    },
    cardFooter: {
        backgroundColor: '#DDEED5',
        paddingVertical: 4,
        paddingHorizontal: 4,
        alignItems: 'center',
    },
    effectText: {
        fontSize: 7,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
        lineHeight: 10,
    },
    fullText: {
        marginTop: 10,
        textAlign: 'center',
        fontSize: 10,
        color: '#B84A4A',
        fontFamily: 'PressStart2P',
    },
    feedingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    feedingImage: {
        width: 60,
        height: 60,
        resizeMode: 'contain',
    },
    feedingText: {
        color: '#FFD700',
        fontSize: 10,
        fontFamily: 'PressStart2P',
        marginTop: 10,
        textAlign: 'center',
    },
});

export default FeedingPage;
