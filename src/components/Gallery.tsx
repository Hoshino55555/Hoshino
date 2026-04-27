import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import InnerScreen from './InnerScreen';
import Room from './Room';

interface Props {
    onBack: () => void;
    onCloseStart?: () => void;
}

// "Gallery" is the legacy file/route name; the page itself is the Room — a
// decoratable space the user fills with cosmetics. Keeping the filename for
// now so all the menu/navigation wiring stays put; rename in a polish pass
// once the room feature is locked in.
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
                <Room />
            </View>
        </InnerScreen>
    );
};

const styles = StyleSheet.create({
    content: {
        flex: 1,
        width: '100%',
    },
});

export default Gallery;
