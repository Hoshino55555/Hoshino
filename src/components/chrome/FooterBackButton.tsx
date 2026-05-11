import React, { useCallback, useEffect, useRef } from 'react';
import {
    Animated,
    Image,
    StyleSheet,
    TouchableOpacity,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { Frames } from '../../assets';

const FOOTER_BACK_BUTTON_OFFSET_Y = 12;

interface FooterBackButtonProps {
    onPress: () => void;
    offsetY?: number;
    style?: StyleProp<ViewStyle>;
}

const FooterBackButton: React.FC<FooterBackButtonProps> = ({
    onPress,
    offsetY = 0,
    style,
}) => {
    const firedRef = useRef(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        firedRef.current = false;
    }, [onPress]);

    const animateScale = useCallback((toValue: number) => {
        Animated.spring(scaleAnim, {
            toValue,
            useNativeDriver: true,
            speed: 36,
            bounciness: 5,
        }).start();
    }, [scaleAnim]);

    const fireOnce = useCallback(() => {
        if (firedRef.current) return;
        firedRef.current = true;
        onPress();
    }, [onPress]);

    return (
        <TouchableOpacity
            style={[
                styles.button,
                offsetY !== 0 && { position: 'relative', top: offsetY },
                style,
            ]}
            onPressIn={() => {
                fireOnce();
                animateScale(0.88);
            }}
            onPressOut={() => animateScale(1)}
            onPress={() => fireOnce()}
            activeOpacity={1}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
        >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Image
                    source={Frames.backButton}
                    style={styles.image}
                    resizeMode="contain"
                />
            </Animated.View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        padding: 4,
        alignItems: 'center',
    },
    image: {
        width: 56,
        height: 56
    },
});

export { FOOTER_BACK_BUTTON_OFFSET_Y };
export default FooterBackButton;
