import React from 'react';
import {
    View,
    StyleSheet,
    Image,
    TouchableOpacity,
    Text,
    useWindowDimensions,
} from 'react-native';
import { useChrome } from '../contexts/ChromeContext';
import { Chrome } from '../assets';

export const DeviceCasing: React.FC = () => {
    const { active, pressFrame } = useChrome();
    const overlayMode = active?.overlayMode ?? false;
    // pressFrame === 1 is idle — skip the strip layer entirely so the
    // casing's painted buttons are the only thing rendered. Otherwise the
    // idle strip would itself overlay the casing's left button (frame 1
    // happens to fall in the left-mask third), and pressing any button
    // would flicker that overlay on/off.
    const showStrip = pressFrame !== 1;
    const stripSource = showStrip
        ? (Chrome.buttonStrips[pressFrame - 1] ?? Chrome.buttonStrips[0])
        : null;

    return (
        <View style={styles.casingLayer} pointerEvents="none">
            <Image
                source={Chrome.casing}
                style={[styles.mainBackground, overlayMode && styles.darkenedBackground]}
                resizeMode="cover"
            />
            {showStrip && stripSource && (
                <Image
                    source={stripSource}
                    style={[styles.mainBackground, overlayMode && styles.darkenedBackground]}
                    resizeMode="cover"
                />
            )}
        </View>
    );
};

export const DeviceButtons: React.FC = () => {
    const { active, pressIn, pressOut } = useChrome();
    const { width, height } = useWindowDimensions();
    const buttonSize = Math.min(width * 0.19, height * 0.09);
    const bottomOffset = height * 0.095;
    const buttonInset = width * 0.14;
    const centerDrop = buttonSize * 0.4;
    const {
        leftButtonText = '',
        centerButtonText = '',
        rightButtonText = '',
        leftButtonDisabled = false,
        centerButtonDisabled = false,
        rightButtonDisabled = false,
        onLeftButtonPress,
        onCenterButtonPress,
        onRightButtonPress,
        overlayMode = false,
    } = active ?? {};

    return (
        <View
            style={[
                styles.bottomButtonContainer,
                {
                    paddingHorizontal: buttonInset,
                    bottom: bottomOffset,
                },
                overlayMode && styles.darkenedButtons,
            ]}
            pointerEvents="box-none"
        >
            <TouchableOpacity
                style={[
                    styles.bottomButton,
                    styles.left,
                    {
                        width: buttonSize,
                        height: buttonSize,
                        borderRadius: buttonSize / 2,
                    },
                    leftButtonDisabled && styles.disabled,
                ]}
                onPressIn={() => !leftButtonDisabled && pressIn('left')}
                onPressOut={() => pressOut('left')}
                onPress={!leftButtonDisabled ? onLeftButtonPress : undefined}
                activeOpacity={0.7}
            >
                <Text style={[styles.buttonText, leftButtonText === 'YES' && styles.yesButtonText]}>
                    {leftButtonText}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[
                    styles.bottomButton,
                    styles.center,
                    {
                        width: buttonSize,
                        height: buttonSize,
                        borderRadius: buttonSize / 2,
                        marginTop: centerDrop,
                    },
                    centerButtonDisabled && styles.disabled,
                ]}
                onPressIn={() => !centerButtonDisabled && pressIn('center')}
                onPressOut={() => pressOut('center')}
                onPress={!centerButtonDisabled ? onCenterButtonPress : undefined}
                activeOpacity={0.7}
            >
                <Text style={styles.buttonText}>{centerButtonText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[
                    styles.bottomButton,
                    styles.right,
                    {
                        width: buttonSize,
                        height: buttonSize,
                        borderRadius: buttonSize / 2,
                    },
                    rightButtonDisabled && styles.disabled,
                ]}
                onPressIn={() => !rightButtonDisabled && pressIn('right')}
                onPressOut={() => pressOut('right')}
                onPress={!rightButtonDisabled ? onRightButtonPress : undefined}
                activeOpacity={0.7}
            >
                <Text style={[styles.buttonText, rightButtonText === 'NO' && styles.noButtonText]}>
                    {rightButtonText}
                </Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    casingLayer: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mainBackground: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        resizeMode: 'contain',
    },
    darkenedBackground: {
        opacity: 0.3,
    },
    darkenedButtons: {
        opacity: 0.3,
    },
    bottomButtonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        position: 'absolute',
        zIndex: 3,
        elevation: 20,
    },
    bottomButton: {
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
    },
    left: {
        marginRight: 'auto',
    },
    center: {
    },
    right: {
        marginLeft: 'auto',
    },
    disabled: {
        opacity: 0.3,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    buttonText: {
        color: '#2E5A3E',
        fontSize: 24,
        fontFamily: 'Monaco',
    },
    yesButtonText: {
        color: '#4CAF50',
    },
    noButtonText: {
        color: '#F44336',
    },
});
