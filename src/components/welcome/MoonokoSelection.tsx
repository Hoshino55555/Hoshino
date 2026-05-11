import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
    useWindowDimensions,
    ScrollView,
    Modal
} from 'react-native';

import InnerScreen from '../chrome/InnerScreen';

import { MOONOKOS } from '../../data/moonokos';
import { Backgrounds, getCharacterAnim } from '../../assets';
import { colors } from '../../styles/tokens';

const getImageSource = (imageName: string) => getCharacterAnim(imageName);



interface Character {
    id: string;
    name: string;
    description: string;
    image: string;
}

interface Props {
    onBack: () => void;
    onNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    onGoToCongratulations?: (character?: Character) => void;
}

const CHARACTERS: Character[] = MOONOKOS.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    image: `${m.imageBase}.gif`,
}));

const MoonokoSelection: React.FC<Props> = ({
    onBack,
    onNotification,
    onGoToCongratulations
}) => {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const cardStride = screenWidth * 0.56;
    const cardMargin = cardStride * 0.045;
    const cardSize = cardStride - cardMargin * 2;
    const cardPadding = cardSize * 0.05;
    const characterImageSize = cardSize * 0.75;
    const slotMachineTopMargin = screenHeight * 0.18;

    const [currentCharacterIndex, setCurrentCharacterIndex] = useState<number>(0); // Start with first character
    const [isMinting, setIsMinting] = useState(false);
    const [isSpinning, setIsSpinning] = useState(false);
    const [showCharacterModal, setShowCharacterModal] = useState(false);
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
    const [showCongratulationsModal, setShowCongratulationsModal] = useState(false);
    const [congratulationsCharacter, setCongratulationsCharacter] = useState<Character | null>(null);
    const scrollerRef = useRef<ScrollView | null>(null);

    const currentCharacter = CHARACTERS[currentCharacterIndex];



    // Scroll to initial position on mount
    useEffect(() => {
        setTimeout(() => {
            if (scrollerRef.current) {
                const initialScrollX = currentCharacterIndex * cardStride;
                scrollerRef.current.scrollTo({
                    x: initialScrollX,
                    animated: false
                });
            }
        }, 100);
    }, [cardStride]);



    // Animation Configuration - Easy to adjust!
    const ANIMATION_CONFIG = {
        // Speed & Duration
        spinDuration: 5000,        // Total spin time in milliseconds
        spinInterval: 35,          // Time between animation frames (lower = smoother)
        
        // Easing Configuration
        easeInPower: 2,            // How aggressive the ease-in is (higher = more dramatic start)
        easeOutPower: 1,           // How aggressive the ease-out is (higher = sharper stop)
        
        // Spin Intensity
        totalLoops: 18,             // How many times to loop through all characters
    };

    const calculateSpinPosition = (elapsed: number, spinDuration: number) => {
        const progress = elapsed / spinDuration;
        
        // Configurable easing function
        const easeInOut = progress < 0.5 ? 
            Math.pow(progress, ANIMATION_CONFIG.easeInPower) * 2 : 
            1 - Math.pow(-2 * progress + 2, ANIMATION_CONFIG.easeOutPower) / 2;
        
        // Calculate scroll position within the CHARACTERS array bounds
        const totalCards = CHARACTERS.length; // 5 cards total
        const totalScrollDistance = cardStride * totalCards * ANIMATION_CONFIG.totalLoops;
        const scrollDistance = totalScrollDistance * easeInOut;
        
        // Ensure we stay within the CHARACTERS array bounds
        return scrollDistance % (totalCards * cardStride);
    };



    const landOnRandomCharacter = () => {
        const finalIndex = Math.floor(Math.random() * CHARACTERS.length);
        const finalScrollX = finalIndex * cardStride;
        
        setCurrentCharacterIndex(finalIndex);
        
        // Smooth scroll to final position
        if (scrollerRef.current) {
            scrollerRef.current.scrollTo({
                x: finalScrollX,
                animated: true
            });
        }
        
        return CHARACTERS[finalIndex];
    };

    const performSpinStep = (elapsed: number, spinDuration: number) => {
        const scrollPosition = calculateSpinPosition(elapsed, spinDuration);
        
        // Update scroll position - this should visibly move the boxes
        if (scrollerRef.current) {
            scrollerRef.current.scrollTo({
                x: scrollPosition,
                animated: false // We're manually controlling the animation
            });
        }
        
        // Update current character index based on scroll position
        const scrollIndex = Math.floor(scrollPosition / cardStride);
        const actualIndex = scrollIndex % CHARACTERS.length;
        setCurrentCharacterIndex(actualIndex);
    };

    const spinSlotMachine = async () => {
        if (isSpinning || isMinting) return;

        setIsSpinning(true);
        setIsMinting(true);
        const spinDuration = ANIMATION_CONFIG.spinDuration;
        const spinInterval = ANIMATION_CONFIG.spinInterval;
        let elapsed = 0;

        const spin = () => {
            elapsed += spinInterval;
            performSpinStep(elapsed, spinDuration);

            if (elapsed < spinDuration) {
                setTimeout(spin, spinInterval);
            } else {
                setIsSpinning(false);
                setTimeout(() => {
                    const selectedCharacter = landOnRandomCharacter();
                    if (selectedCharacter) {
                        handleSpinComplete(selectedCharacter);
                    }
                }, 100);
            }
        };

        spin();
    };

    const handleSpinComplete = (character: Character) => {
        onNotification?.(`✨ You got ${character.name}!`, 'success');
        setCongratulationsCharacter(character);
        setShowCongratulationsModal(true);
        setIsMinting(false);
    };



    // Using the consolidated hook from above





    const handleCharacterPress = (character: Character) => {
        setSelectedCharacter(character);
        setShowCharacterModal(true);
    };

    const closeCharacterModal = () => {
        setShowCharacterModal(false);
        setSelectedCharacter(null);
    };

    const closeCongratulationsModal = () => {
        setShowCongratulationsModal(false);
        setCongratulationsCharacter(null);
    };

    const handleMintCharacter = () => {
        if (congratulationsCharacter) {
            console.log('🎉 Character minted successfully:', congratulationsCharacter.name);
            
            closeCongratulationsModal();
            
            // Navigate to congratulations screen or back to welcome
            if (onGoToCongratulations) {
                onGoToCongratulations(congratulationsCharacter);
            } else {
                onBack(); // Fallback to back
            }
        }
    };

    return (
        <>
            <InnerScreen
                onLeftButtonPress={undefined}
                onCenterButtonPress={undefined}
                onRightButtonPress={undefined}
                leftButtonText=""
                centerButtonText=""
                rightButtonText=""
                centerButtonDisabled={true}
                rightButtonDisabled={true}
                leftButtonDisabled={true}
                isSelectionPage={true}
                overlayMode={true}
                showCloseButton={true}
                onCloseButtonPress={onBack}
            >
            {/* Main Display Area */}
            <View style={styles.mainDisplayArea}>
                <Image source={Backgrounds.screen} style={styles.backgroundImage as any} resizeMode="cover" />
                {/* Character Selection Scroller */}
                <View style={[styles.slotMachineContainer, { marginTop: slotMachineTopMargin }]}>
                    <ScrollView
                        ref={scrollerRef}
                        horizontal
                        style={{ flex: 1 }}
                        contentContainerStyle={{ 
                            flexDirection: 'row',
                            paddingHorizontal: (screenWidth - cardStride) / 2
                        }}
                        decelerationRate="fast"
                        showsHorizontalScrollIndicator={false}
                        onScroll={(e) => {
                            const offsetX = e.nativeEvent.contentOffset.x;
                            const scrollIndex = Math.round(offsetX / cardStride);
                            const actualIndex = Math.max(0, Math.min(scrollIndex, CHARACTERS.length - 1));
                            setCurrentCharacterIndex(actualIndex);
                        }}
                    >
                        {CHARACTERS.map((character, index) => {
                            return (
                            <TouchableOpacity
                                key={`${character.id}-${index}`}
                                style={[
                                    styles.slotMachineCard,
                                    {
                                        width: cardSize,
                                        height: cardSize,
                                        marginHorizontal: cardMargin,
                                        padding: cardPadding,
                                    },
                                ]}
                                onPress={() => {
                                    handleCharacterPress(character);
                                }}
                            >


                                {/* Character Info */}
                                <View style={styles.characterInfo}>
                                    <Text style={styles.characterName}>{character.name}</Text>
                                </View>

                                {/* Character Image */}
                                <Image
                                    source={getImageSource(character.image)}
                                    style={[
                                        styles.characterImage,
                                        {
                                            width: characterImageSize,
                                            height: characterImageSize,
                                            marginTop: cardSize * 0.1,
                                        },
                                        isSpinning && styles.spinningImage
                                    ] as any}
                                    onError={(error) => console.log('Image load error for', character.name, ':', error)}
                                    resizeMode="contain"
                                />
                            </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Spin Controls */}
                <View style={styles.spinControls}>
                    <TouchableOpacity
                        style={styles.spinButton}
                        onPress={isSpinning || isMinting ? undefined : spinSlotMachine}
                    >
                        <Text style={styles.spinText}>
                            {isSpinning ? 'MINTING...' : 'MINT'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
            
            {/* Character Detail Modal */}
            <Modal
                visible={showCharacterModal}
                transparent={true}
                animationType="fade"
                onRequestClose={closeCharacterModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {selectedCharacter && (
                            <>
                                <TouchableOpacity
                                    style={styles.modalCloseButton}
                                    onPress={closeCharacterModal}
                                >
                                    <Text style={styles.modalCloseText}>✕</Text>
                                </TouchableOpacity>
                                
                                <Image
                                    source={getImageSource(selectedCharacter.image)}
                                    style={styles.modalCharacterImage as any}
                                    resizeMode="contain"
                                />
                                
                                <Text style={styles.modalCharacterName}>{selectedCharacter.name}</Text>
                                
                                <Text style={styles.modalDescription}>{selectedCharacter.description}</Text>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Congratulations Modal */}
            <Modal
                visible={showCongratulationsModal}
                transparent={true}
                animationType="fade"
                onRequestClose={closeCongratulationsModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {congratulationsCharacter && (
                            <>
                                <TouchableOpacity
                                    style={styles.modalCloseButton}
                                    onPress={closeCongratulationsModal}
                                >
                                    <Text style={styles.modalCloseText}>✕</Text>
                                </TouchableOpacity>
                                
                                <Text style={styles.congratulationsTitle}>Congratulations!</Text>
                                
                                <Image
                                    source={getImageSource(congratulationsCharacter.image)}
                                    style={styles.modalCharacterImage as any}
                                    resizeMode="contain"
                                />
                                
                                <Text style={styles.modalCharacterName}>{congratulationsCharacter.name}</Text>
                                
                                <Text style={styles.modalDescription}>{congratulationsCharacter.description}</Text>
                                
                                <TouchableOpacity
                                    style={styles.mintButton}
                                    onPress={handleMintCharacter}
                                >
                                    <Text style={styles.mintButtonText}>Continue</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </InnerScreen>
        </>
    );
};

const styles = StyleSheet.create({
    mainDisplayArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backgroundImage: {
        position: 'absolute' as const,
        width: '100%',
        height: '100%',
    },
    slotMachineContainer: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    slotMachineScroller: {
        flex: 1,
        width: '100%',
    },
    slotMachineTrack: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 50,
    },
    slotMachineCard: {
        backgroundColor: colors.mintPale,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: colors.forestDark,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },

    spinning: {
        // Blur or animation if needed
    },
    spinningImage: {
        opacity: 0.7,
        transform: [{ scale: 0.95 }],
    } as const,

    characterImage: {
    } as any,
    characterInfo: {
        marginBottom: -20,
        alignItems: 'center',
    },
    characterName: {
        fontSize: 33,
        color: colors.forestDark,
        textAlign: 'center',
        fontFamily: 'Monaco',
    },
    spinControls: {
        marginTop: 20,
        marginBottom: 20,
        alignItems: 'center',
    },
    spinButton: {
        backgroundColor: colors.mintPale,
        padding: 10,
        borderRadius: 8,
        borderWidth: 3,
        borderColor: colors.forestDark,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 80,
    },
    spinText: {
        color: colors.forestDark,
        fontSize: 14,
        fontFamily: 'Monaco',
        transform: [{ translateX: 1 }, { translateY: 4 }],
    },

    // Modal styles
    modalOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: colors.mintPale,
        borderRadius: 16,
        padding: 20,
        margin: 20,
        maxWidth: '90%',
        maxHeight: '80%',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    modalCloseButton: {
        position: 'absolute',
        top: 10,
        right: 15,
        zIndex: 1,
        width: 30,
        height: 30,
        borderRadius: 4,
        backgroundColor: colors.forestDark,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.forestDark,
    },
    modalCloseText: {
        fontSize: 18,
        color: colors.mintPale,
        fontFamily: 'Monaco',
        transform: [{ translateY: -1 }],
    },
    modalCharacterImage: {
        width: 120,
        height: 120,
        marginBottom: 15,
    } as const,
    modalCharacterName: {
        fontSize: 47,

        color: colors.forestDark,
        marginBottom: 10,
        textAlign: 'center',
        fontFamily: 'Monaco',
    },
    modalDescription: {
        fontSize: 24,
        color: colors.forestDark,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 15,
        fontFamily: 'Monaco',
    },
    congratulationsTitle: {
        fontSize: 38,
        color: colors.forestDark,
        textAlign: 'center',
        marginBottom: 15,
        fontFamily: 'Monaco',
    },
    mintButton: {
        backgroundColor: colors.forestDark,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: colors.mintPale,
        marginTop: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mintButtonText: {
        color: colors.mintPale,
        fontSize: 30,
        fontFamily: 'Monaco',
    },

});

export default MoonokoSelection;
