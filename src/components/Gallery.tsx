import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import InnerScreen from './InnerScreen';

interface Props {
    onBack: () => void;
    onCloseStart?: () => void;
}

const Gallery: React.FC<Props> = ({ onBack, onCloseStart }) => {
    const [isClosing, setIsClosing] = useState(false);

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
        onCloseStart?.();
    };

    return (
        <InnerScreen
            expanded
            animateIn
            exiting={isClosing}
            onExitComplete={onBack}
            showBackgroundImage={false}
            leftButtonText=""
            centerButtonText=""
            rightButtonText=""
            onLeftButtonPress={handleClose}
        >
            <View style={styles.content}>
                <Text style={styles.title}>Gallery</Text>
                <Text style={styles.subtitle}>Coming Soon</Text>
                <Text style={styles.placeholder}>
                    Character achievements, milestones, and memories will appear here.
                </Text>
            </View>
        </InnerScreen>
    );
};

const styles = StyleSheet.create({
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    title: {
        fontSize: 20,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
        marginBottom: 16,
    },
    subtitle: {
        fontSize: 12,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
        opacity: 0.75,
        marginBottom: 24,
    },
    placeholder: {
        fontSize: 10,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
        textAlign: 'center',
        lineHeight: 16,
        opacity: 0.7,
    },
});

export default Gallery;
