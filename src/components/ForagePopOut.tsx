import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, Easing, StyleSheet, Text } from 'react-native';
import type { ForagedItem } from '../services/GameStateService';

const INGREDIENT_IMAGES: Record<string, any> = {
    mira_berry: require('../../assets/images/Mira Berry.png'),
    nova_egg: require('../../assets/images/Nova Egg.png'),
    pink_sugar: require('../../assets/images/Pink Sugar.png'),
};

const INGREDIENT_LABELS: Record<string, string> = {
    mira_berry: 'Mira Berry',
    nova_egg: 'Nova Egg',
    pink_sugar: 'Pink Sugar',
};

interface Props {
    items: ForagedItem[];
    onComplete: () => void;
}

// Scatters ingredient sprites from a center origin outward in random directions
// with fade + scale. Calls onComplete when the last animation finishes.
const ForagePopOut: React.FC<Props> = ({ items, onComplete }) => {
    const animRefs = useRef(items.map(() => new Animated.Value(0))).current;
    const completedRef = useRef(false);

    useEffect(() => {
        if (items.length === 0) {
            onComplete();
            return;
        }
        const anims = items.map((_, i) =>
            Animated.timing(animRefs[i], {
                toValue: 1,
                duration: 1400,
                delay: i * 80,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            })
        );
        Animated.parallel(anims).start(() => {
            if (!completedRef.current) {
                completedRef.current = true;
                onComplete();
            }
        });
    }, [items, onComplete, animRefs]);

    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {items.map((item, i) => {
                // Fan items across the upper half-circle so they arc up and out.
                const angle = -Math.PI / 2 + ((i / Math.max(1, items.length - 1)) - 0.5) * Math.PI * 0.9;
                const distance = 90 + (i % 3) * 20;
                const translateX = animRefs[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.cos(angle) * distance],
                });
                const translateY = animRefs[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.sin(angle) * distance],
                });
                const opacity = animRefs[i].interpolate({
                    inputRange: [0, 0.2, 0.8, 1],
                    outputRange: [0, 1, 1, 0],
                });
                const scale = animRefs[i].interpolate({
                    inputRange: [0, 0.3, 1],
                    outputRange: [0.4, 1.0, 0.7],
                });
                const img = INGREDIENT_IMAGES[item.ingredient];
                const label = INGREDIENT_LABELS[item.ingredient] || item.ingredient;
                return (
                    <Animated.View
                        key={item.id}
                        style={[
                            styles.popItem,
                            { opacity, transform: [{ translateX }, { translateY }, { scale }] },
                        ]}
                    >
                        {img ? (
                            <Image source={img} style={styles.ingredientImage} resizeMode="contain" />
                        ) : (
                            <Text style={styles.fallbackLabel}>{label}</Text>
                        )}
                    </Animated.View>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    popItem: {
        position: 'absolute',
        top: '40%',
        left: '50%',
        marginLeft: -20,
        marginTop: -20,
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ingredientImage: {
        width: 40,
        height: 40,
    },
    fallbackLabel: {
        fontFamily: 'PressStart2P',
        fontSize: 10,
        color: '#fff',
    },
});

export default ForagePopOut;
