import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import FooterBackButton, { FOOTER_BACK_BUTTON_OFFSET_Y } from './FooterBackButton';

interface FooterBackBarProps {
    onBack: () => void;
    height?: number;
    bottomInset?: number;
    paddingBottom?: number;
    style?: StyleProp<ViewStyle>;
}

const FooterBackBar: React.FC<FooterBackBarProps> = ({
    onBack,
    height,
    bottomInset = 0,
    paddingBottom,
    style,
}) => (
    <View
        style={[
            styles.bar,
            height != null && { height },
            { paddingBottom: paddingBottom ?? bottomInset },
            style,
        ]}
        pointerEvents="box-none"
    >
        <FooterBackButton onPress={onBack} offsetY={FOOTER_BACK_BUTTON_OFFSET_Y} />
    </View>
);

const styles = StyleSheet.create({
    bar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingHorizontal: 16,
        zIndex: 2,
    },
});

export default FooterBackBar;
