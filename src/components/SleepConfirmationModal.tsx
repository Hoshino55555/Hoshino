import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Modal,
    Dimensions,
} from 'react-native';

const { width, height } = Dimensions.get('window');

interface Character {
    id: string;
    name: string;
    description: string;
    image: string;
    nftMint?: string | null;
}

interface Props {
    visible: boolean;
    character: Character | null;
    playerName?: string; // Add playerName prop
    onConfirm: () => void;
    onCancel: () => void;
}

type DialogPhase = 'confirmation' | 'alright' | 'goodnight' | 'completed';

const SleepConfirmationModal: React.FC<Props> = ({
    visible,
    character,
    playerName,
    onConfirm,
    onCancel
}) => {
    const [dialogPhase, setDialogPhase] = useState<DialogPhase>('confirmation');
    const [displayedText, setDisplayedText] = useState<string>('');
    const [isTyping, setIsTyping] = useState<boolean>(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const typewriterEffect = (text: string, duration: number = 2000) => {
        setIsTyping(true);
        setDisplayedText('');

        const characters = text.split('');
        const delay = duration / characters.length;

        characters.forEach((char, index) => {
            typingTimeoutRef.current = setTimeout(() => {
                setDisplayedText(prev => prev + char);

                if (index === characters.length - 1) {
                    setIsTyping(false);
                }
            }, delay * index);
        });
    };

    const clearTypingTimeouts = () => {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
    };

    useEffect(() => {
        return () => {
            clearTypingTimeouts();
        };
    }, []);

    useEffect(() => {
        if (visible) {
            setDialogPhase('confirmation');
            setDisplayedText('');
            setIsTyping(false);

            // Retro-style animation: quick pop-in
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 120,
                    friction: 6,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                // Start typing the initial message
                const initialMessage = getDialogContent().message;
                typewriterEffect(initialMessage, 1500);
            });
        } else {
            // Reset for next time
            fadeAnim.setValue(0);
            scaleAnim.setValue(0.8);
            setDialogPhase('confirmation');
            setDisplayedText('');
            setIsTyping(false);
            clearTypingTimeouts();
        }
    }, [visible]);

    const handleYes = () => {
        // Start the message progression
        setDialogPhase('alright');
        const alrightMessage = 'Alright. Time to go touch some pillows!!!';
        typewriterEffect(alrightMessage, 1800);

        // After typing + brief pause, show goodnight message
        setTimeout(() => {
            setDialogPhase('goodnight');
            const playerDisplayName = playerName || 'Player';
            const goodnightMessage = `GN ${playerDisplayName}. See you tomorrow!`;
            typewriterEffect(goodnightMessage, 1500);

            // After goodnight typing + brief pause, complete and trigger sleep overlay
            setTimeout(() => {
                setDialogPhase('completed');

                // Quick retro fade out
                Animated.parallel([
                    Animated.timing(fadeAnim, {
                        toValue: 0,
                        duration: 150,
                        useNativeDriver: true,
                    }),
                    Animated.timing(scaleAnim, {
                        toValue: 0.8,
                        duration: 150,
                        useNativeDriver: true,
                    }),
                ]).start(() => {
                    onConfirm();
                });
            }, 2200); // Wait for typing (1500ms) + pause (700ms)
        }, 2300); // Wait for typing (1800ms) + pause (500ms)
    };

    const handleNo = () => {
        // Quick retro fade out
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
                toValue: 0.8,
                duration: 150,
                useNativeDriver: true,
            }),
        ]).start(() => {
            onCancel();
        });
    };

    const getDialogContent = () => {
        // Debug logging
        console.log('PlayerName in modal:', playerName);

        switch (dialogPhase) {
            case 'confirmation':
                return {
                    message: 'Is it shut-eye time???',
                    showButtons: true,
                };
            case 'alright':
                return {
                    message: 'Alright. Time to go touch some pillows!!!',
                    showButtons: false,
                };
            case 'goodnight':
                const displayName = playerName || 'Player';
                console.log('Using display name:', displayName);
                return {
                    message: `GN ${displayName}. See you tomorrow!`,
                    showButtons: false,
                };
            default:
                return {
                    message: '',
                    showButtons: false,
                };
        }
    };

    const dialogContent = getDialogContent();
    const textToShow = dialogPhase === 'confirmation' ? dialogContent.message : displayedText;

    if (!visible) {
        return null;
    }

    return (
        <Modal
            transparent
            visible={visible}
            animationType="none"
            onRequestClose={onCancel}
        >
            <Animated.View
                style={[
                    styles.modalOverlay,
                    {
                        opacity: fadeAnim,
                    },
                ]}
            >
                <Animated.View
                    style={[
                        styles.modalContainer,
                        {
                            transform: [{ scale: scaleAnim }],
                        },
                    ]}
                >
                    {/* Cosmic Window Header */}
                    <View style={styles.windowHeader}>
                        <View style={styles.windowTitle}>
                            <Text style={styles.titleText}>💤 Sleep Mode</Text>
                        </View>
                    </View>

                    {/* Content Area */}
                    <View style={styles.contentArea}>
                        <Text style={styles.messageText}>{textToShow}</Text>

                        {/* Typing cursor effect */}
                        {isTyping && (
                            <Text style={styles.typingCursor}>|</Text>
                        )}

                        {/* Pixel dots for loading phases */}
                        {!dialogContent.showButtons && !isTyping && (
                            <View style={styles.dotsContainer}>
                                <View style={styles.cosmicDot} />
                                <View style={styles.cosmicDot} />
                                <View style={styles.cosmicDot} />
                            </View>
                        )}

                        {/* Buttons */}
                        {dialogContent.showButtons && (
                            <View style={styles.buttonContainer}>
                                <TouchableOpacity
                                    style={[styles.button, styles.noButton]}
                                    onPress={handleNo}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.buttonText}>No</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.button, styles.yesButton]}
                                    onPress={handleYes}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.buttonText}>Yes</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContainer: {
        backgroundColor: '#e5dcf5', // Soft pastel purple cosmic background
        borderRadius: 4,
        width: width * 0.85,
        maxWidth: 380,
        minHeight: 160,
        borderWidth: 3,
        borderColor: '#000000', // Keep dark pixel border
        // Hard pixel-style shadow
        shadowColor: '#000000',
        shadowOffset: { width: 3, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 0,
        elevation: 15,
    },
    windowHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center', // Center the title since no controls
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#c6d6f2', // Soft cosmic blue for header
        borderBottomWidth: 2,
        borderBottomColor: '#000000',
    },
    windowTitle: {
        alignItems: 'center',
    },
    titleText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#2d1b69', // Deep purple text
        fontFamily: 'monospace',
        letterSpacing: 1,
    },
    contentArea: {
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 120,
    },
    messageText: {
        fontSize: 16,
        color: '#2d1b69', // Deep purple text for contrast
        textAlign: 'center',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        lineHeight: 22,
        letterSpacing: 0.5,
        marginBottom: 20,
        minHeight: 44, // Reserve space to prevent layout shift during typing
    },
    typingCursor: {
        fontSize: 16,
        color: '#2d1b69',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        position: 'absolute',
        right: 0,
        top: 0,
        opacity: 0.8,
    },
    dotsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        marginTop: 10,
    },
    cosmicDot: {
        width: 8,
        height: 8,
        backgroundColor: '#8b5cf6', // Cosmic purple dots
        borderRadius: 4, // Slightly rounded for dreamy effect
        shadowColor: '#8b5cf6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 16,
        marginTop: 24,
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 3,
        borderWidth: 2,
        borderColor: '#000000',
        minWidth: 85,
        alignItems: 'center',
        // Soft pixel shadow
        shadowColor: '#000000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 0,
        elevation: 6,
    },
    noButton: {
        backgroundColor: '#a8a8e0', // Soft violet
    },
    yesButton: {
        backgroundColor: '#8ee2d9', // Pastel teal/aqua
    },
    buttonText: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#2d1b69', // Dark purple text for both buttons
        fontFamily: 'monospace',
        letterSpacing: 1,
    },
});

export default SleepConfirmationModal;