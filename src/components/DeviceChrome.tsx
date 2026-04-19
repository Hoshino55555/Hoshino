import React from 'react';
import {
    View,
    StyleSheet,
    Image,
    TouchableOpacity,
    Text,
    Dimensions,
} from 'react-native';
import { useChrome } from '../contexts/ChromeContext';

const { width: screenWidth } = Dimensions.get('window');
const isTablet = screenWidth > 768;

export const DeviceCasing: React.FC = () => {
    const { active } = useChrome();
    const overlayMode = active?.overlayMode ?? false;

    return (
        <View style={styles.casingLayer} pointerEvents="none">
            <Image
                source={require('../../assets/images/casing.png')}
                style={[styles.mainBackground, overlayMode && styles.darkenedBackground]}
                resizeMode="cover"
            />
        </View>
    );
};

export const DeviceButtons: React.FC = () => {
    const { active } = useChrome();
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
        <>
            <View
                style={[styles.bottomButtonContainer, overlayMode && styles.darkenedButtons]}
                pointerEvents="box-none"
            >
                <TouchableOpacity
                    style={[styles.bottomButton, styles.left, leftButtonDisabled && styles.disabled]}
                    onPress={!leftButtonDisabled ? onLeftButtonPress : undefined}
                >
                    <Image source={require('../../assets/images/button.png')} style={styles.buttonImage} />
                    <Text style={[styles.buttonText, leftButtonText === 'YES' && styles.yesButtonText]}>
                        {leftButtonText}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.bottomButton, styles.center, centerButtonDisabled && styles.disabled]}
                    onPress={!centerButtonDisabled ? onCenterButtonPress : undefined}
                >
                    <Image source={require('../../assets/images/button.png')} style={styles.buttonImage} />
                    <Text style={styles.buttonText}>{centerButtonText}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.bottomButton, styles.right, rightButtonDisabled && styles.disabled]}
                    onPress={!rightButtonDisabled ? onRightButtonPress : undefined}
                >
                    <Image source={require('../../assets/images/button.png')} style={styles.buttonImage} />
                    <Text style={[styles.buttonText, rightButtonText === 'NO' && styles.noButtonText]}>
                        {rightButtonText}
                    </Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={[styles.deviceButton, styles.leftPhysical]}
                onPress={!leftButtonDisabled ? onLeftButtonPress : undefined}
            />
            <TouchableOpacity
                style={[styles.deviceButton, styles.centerPhysical]}
                onPress={!centerButtonDisabled ? onCenterButtonPress : undefined}
            />
            <TouchableOpacity
                style={[styles.deviceButton, styles.rightPhysical]}
                onPress={!rightButtonDisabled ? onRightButtonPress : undefined}
            />
        </>
    );
};

const styles = StyleSheet.create({
    casingLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'black',
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonsLayer: {
        ...StyleSheet.absoluteFillObject,
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
        paddingHorizontal: isTablet ? 40 : 55,
        position: 'absolute',
        bottom: isTablet ? 20 : 100,
        zIndex: 3,
        elevation: 20,
    },
    bottomButton: {
        width: isTablet ? 80 : 75,
        height: isTablet ? 80 : 75,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: isTablet ? 40 : 30,
        overflow: 'hidden',
        position: 'relative',
    },
    left: {
        marginRight: 'auto',
    },
    center: {
        marginTop: isTablet ? 10 : 30,
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
        fontSize: 16,
        fontWeight: 'bold',
    },
    buttonImage: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: isTablet ? 40 : 30,
    },
    yesButtonText: {
        color: '#4CAF50',
    },
    noButtonText: {
        color: '#F44336',
    },
    deviceButton: {
        position: 'absolute',
        width: 50,
        height: 50,
        backgroundColor: 'transparent',
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 3,
        elevation: 20,
    },
    leftPhysical: {
        bottom: 20,
        left: 20,
    },
    centerPhysical: {
        bottom: 20,
        left: '50%',
        transform: [{ translateX: -25 }],
    },
    rightPhysical: {
        bottom: 20,
        right: 20,
    },
});
