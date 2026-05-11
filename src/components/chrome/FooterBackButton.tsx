import React from 'react';
import {
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
}) => (
    <TouchableOpacity
        style={[
            styles.button,
            offsetY !== 0 && { position: 'relative', top: offsetY },
            style,
        ]}
        onPress={onPress}
        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Back"
    >
        <Image
            source={Frames.backButton}
            style={styles.image}
            resizeMode="contain"
        />
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    button: {
        padding: 4,
        alignItems: 'center',
    },
    image: {
        width: 56,
        height: 46,
    },
});

export { FOOTER_BACK_BUTTON_OFFSET_Y };
export default FooterBackButton;
