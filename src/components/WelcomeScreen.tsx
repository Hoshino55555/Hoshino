import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions, TextInput } from 'react-native';
import Frame from './Frame';
import { useWallet } from '../contexts/WalletContext';
import InnerScreen from './InnerScreen';

// Get screen dimensions for responsive sizing
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const isTablet = screenWidth > 768; // Common tablet breakpoint

interface Props {
    onContinue: (playerName?: string) => void;
    onGoToInteraction?: (playerName?: string) => void;
    onGoToSelection?: (fromPhase?: string) => void;
    connected: boolean;
    onConnectWallet?: () => void;
    playerName?: string;
    goToCongratulations?: boolean;
    initialPhase?: string;
    selectedMoonokoName?: string;
}

const WelcomeScreen: React.FC<Props> = ({ onContinue, onGoToInteraction, onGoToSelection, connected, onConnectWallet, playerName: storedPlayerName, goToCongratulations, initialPhase, selectedMoonokoName }) => {
    const { publicKey } = useWallet();
    
    const [currentPhase, setCurrentPhase] = useState<'intro' | 'introNo' | 'name' | 'nameInput' | 'explanation' | 'explanationNo' | 'chooseMoonoko' | 'congratulations' | 'mintMore' | 'final' | 'complete'>(initialPhase as any || 'intro');
    const [playerName, setPlayerName] = useState(storedPlayerName || '');
    const [dialogIndex, setDialogIndex] = useState(0);
    const [selectedChoice, setSelectedChoice] = useState<'yes' | 'no'>('yes');
    const [arrowOpacity, setArrowOpacity] = useState(1);
    const [displayText, setDisplayText] = useState('');
    const [textIndex, setTextIndex] = useState(0);
    const [isTyping, setIsTyping] = useState(false);
    const [isDialogChanging, setIsDialogChanging] = useState(false);
    const [showOptionsAfterDelay, setShowOptionsAfterDelay] = useState(false);
    const [displaySegments, setDisplaySegments] = useState<Array<{text: string, isBold: boolean}>>([]);
    const [segmentIndex, setSegmentIndex] = useState(0);
    const [charIndex, setCharIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [transitionOpacity, setTransitionOpacity] = useState(0);
    const [dialogContainerWidth, setDialogContainerWidth] = useState(0);

    
    // Use refs to track current state in intervals
    const segmentIndexRef = useRef(0);
    const charIndexRef = useRef(0);

    // Update phase when initialPhase prop changes
    useEffect(() => {
        if (initialPhase && initialPhase !== currentPhase) {
            setCurrentPhase(initialPhase as any);
        }
    }, [initialPhase]);

    // Function to split text into chunks that fit within 3 lines
    const splitTextIntoChunks = (text: string, maxCharsPerLine: number = 35) => {
        // Special case for "I HIT THE MOON!!" to ensure it's on 2 lines when bold
        if (text === "I HIT THE MOON!!!!!") {
            return ["I HIT THE\nMOON!!!!!"];
        }
        
        const words = text.split(' ');
        const chunks: string[] = [];
        let currentChunk = '';
        
        words.forEach((word) => {
            const testChunk = currentChunk + (currentChunk ? ' ' : '') + word;
            
            if (testChunk.length <= maxCharsPerLine) {
                currentChunk = testChunk;
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk);
                }
                currentChunk = word;
            }
        });
        
        if (currentChunk) {
            chunks.push(currentChunk);
        }
        
        // Only split into groups if the total text is very long
        if (chunks.length <= 3) {
            return [chunks.join(' ')];
        }
        
        // Split into groups of 3 lines max
        const lineGroups: string[] = [];
        let currentGroup = '';
        
        chunks.forEach((chunk, index) => {
            if (index > 0 && index % 3 === 0) {
                lineGroups.push(currentGroup.trim());
                currentGroup = '';
            }
            currentGroup += (currentGroup ? '\n' : '') + chunk;
        });
        
        if (currentGroup) {
            lineGroups.push(currentGroup.trim());
        }
        
        return lineGroups;
    };

    // Function to process text into segments with bold formatting
    const processTextToSegments = (text: string) => {
        const boldWords = [
            "CRASHHH KABOOMM",
            "FGSHSHDGJQNDBZBSBOCZZZZ",
            "I HIT THE MOON!!!"
        ];
        
        let segments: Array<{text: string, isBold: boolean}> = [];
        let currentText = text;
        
        boldWords.forEach((boldWord) => {
            const parts = currentText.split(boldWord);
            if (parts.length > 1) {
                // Add regular text before bold word
                if (parts[0]) {
                    segments.push({text: parts[0], isBold: false});
                }
                
                // Add bold word
                segments.push({text: boldWord, isBold: true});
                
                // Update currentText for next iteration
                currentText = parts.slice(1).join(boldWord);
            }
        });
        
        // Add any remaining text
        if (currentText) {
            segments.push({text: currentText, isBold: false});
        }
        
        return segments.length > 0 ? segments : [{text: text, isBold: false}];
    };

    // Function to render segments with current typewriter progress
    const renderSegments = (segments: Array<{text: string, isBold: boolean}>, currentSegmentIndex: number, currentCharIndex: number) => {
        return (
            <View style={styles.storyTextContainer}>
                {segments.map((segment, index) => {
                    if (index < currentSegmentIndex) {
                        // Fully rendered segment
                        if (segment.isBold) {
                            return (
                                <View key={index} style={styles.centeredSegmentContainer}>
                                    <Text style={styles.storyTextLarge}>
                                        {segment.text}
                                    </Text>
                                </View>
                            );
                        } else {
                            return (
                                <Text key={index} style={styles.storyTextLarge}>
                                    {segment.text}
                                </Text>
                            );
                        }
                    } else if (index === currentSegmentIndex) {
                        // Currently typing segment
                        const visibleText = segment.text.substring(0, currentCharIndex);
                        if (segment.isBold) {
                            return (
                                <View key={index} style={styles.centeredSegmentContainer}>
                                    <Text style={styles.storyTextLarge}>
                                        {visibleText}
                                    </Text>
                                </View>
                            );
                        } else {
                            return (
                                <Text key={index} style={styles.storyTextLarge}>
                                    {visibleText}
                                </Text>
                            );
                        }
                    } else {
                        // Not yet reached
                        return null;
                    }
                })}
            </View>
        );
    };

    // Dialog content for each phase with proper text splitting
    const dialogs = {
        intro: [
            "Uggggghhhh... Oh?",
            "Hiiii! My name is Hoshino!",
            "See, I'm a little in trouble right now...",
            "Do you want to help me?"
        ],
        introNo: [
            "O-ok...",
            "...",
            "Are you sure? :frowning:"
        ],
        name: [
            "Ohhhh thank you! But first, what's your name?"
        ],
        explanation: [
            "Amazing, " + playerName + "! Let me explain.",
            "I was on a long travel and I couldn't find", 
            "a safe space for me to rest, I was sooooooooo",
            "so tired, and at some point I...",
            "I...",
            "Zzzzz...",
            "Zzzzzzzzzzzzz...",
            "Until...",
            "CRASHHH KABOOMM",
            "FGSHSHDGJQNDBZBSBOCZZZZ",
            "I HIT THE MOON!!!",
            "I-I did a mess...",
            "It wasn't my intention I swear!",
            "But the problem doesn't finish here...",
            "Since the crash, some tiny creatures...",
            "started emerging from the crater I made.",
            "I don't know what to do with them,",
            "is it ok if I send you one?",
            "every new Moon Cycle?"
        ],
        explanationNo: [
            "O-ok...",
            "I saw one that was so cute I thought you would have loved it but...",
            "You sure?"
        ],
        chooseMoonoko: [
            "Amazing news!",
            "Hush hush, choose and mint your Moonoko!"
        ],
        congratulations: [
            selectedMoonokoName ? `YAY! IT'S ${selectedMoonokoName.toUpperCase()}!` : "YAY! IT'S YOUR MOONOKO!"
        ],
        mintMore: [
            "Happy with your pick?",

        ],
        final: [
            "Woo-hoooo!",
            "Fantastic choice cheeky!",
            "From today, you will be its guardian.",
            "Now hear me out.",
            "Your goal is to keep its mood maxxed out every day.",
            "To do so, you need to perform some actions daily:",
            "you can feed, chat, play, put to sleep,",
            "and let it meet its friends.",
            "At the end of the Moon Cycle,",
            "you and your pet will part ways.",
            "It will ascend back to the moon,",
            "where it belongs, changed by",
            "the way you treated it.",
            "Take good care of it",
            "and you'll be nicely rewarded.",
            "See you in 28 days pal!"
        ]
    };

    // Process dialogs to ensure no message is longer than 3 lines
    const processedDialogs = Object.keys(dialogs).reduce((acc, phase) => {
        acc[phase] = [];
        dialogs[phase].forEach((message) => {
            const chunks = splitTextIntoChunks(message);
            acc[phase].push(...chunks);
        });
        return acc;
    }, {} as Record<string, string[]>);

    // Update local state when stored player name changes
    useEffect(() => {
        if (storedPlayerName && storedPlayerName.trim().length > 0) {
            console.log('📱 WelcomeScreen: Received stored player name:', storedPlayerName);
            setPlayerName(storedPlayerName);
            // If we have a stored name and wallet is connected, auto-continue
            if (connected) {
                console.log('📱 WelcomeScreen: Auto-continuing with stored name');
                setTimeout(() => {
                    onContinue(storedPlayerName);
                }, 500);
            }
        }
    }, [storedPlayerName, connected, onContinue]);

    // Auto-continue after wallet connects and name is provided
    useEffect(() => {
        if (connected && currentPhase === 'complete' && playerName.trim().length > 0) {
            console.log('📱 WelcomeScreen: Auto-continuing after name entry');
            setTimeout(() => {
                onContinue(playerName);
            }, 1000);
        }
    }, [connected, currentPhase, onContinue, playerName]);

    // Check if we should go to congratulations (after minting)
    useEffect(() => {
        if (goToCongratulations) {
            console.log('📱 WelcomeScreen: Going to congratulations phase');
            console.log('📱 WelcomeScreen: Selected moonoko name:', selectedMoonokoName);
            setCurrentPhase('congratulations');
            setDialogIndex(0);
        }
    }, [goToCongratulations, selectedMoonokoName]);

    const handleDialogClick = () => {
        if (dialogIndex < processedDialogs[currentPhase].length - 1) {
            setDialogIndex(prev => prev + 1);
        } else {
            // Move to next phase
            switch (currentPhase) {
                case 'intro':
                    // Will be handled by button choice
                    break;
                case 'introNo':
                    // Will be handled by button choice
                    break;
                case 'name':
                    setCurrentPhase('nameInput');
                    break;
                case 'explanation':
                    // Will be handled by button choice
                    break;
                case 'explanationNo':
                    // Will be handled by button choice
                    break;
                case 'chooseMoonoko':
                    // Go to moonoko selection screen
                    if (onGoToSelection) {
                        onGoToSelection(currentPhase);
                    } else {
                        onContinue(playerName); // Fallback
                    }
                    break;
                case 'congratulations':
                    setCurrentPhase('mintMore');
                    break;
                case 'mintMore':
                    // Will be handled by button choice
                    break;
                case 'final':
                    // Start transition animation
                    setIsTransitioning(true);
                    setTransitionOpacity(0);
                    
                    // Choppy fade out animation (5-6 layers, 0.5s apart)
                    const fadeOutSteps = [0.2, 0.4, 0.6, 0.8, 1.0];
                    fadeOutSteps.forEach((opacity, index) => {
                        setTimeout(() => {
                            setTransitionOpacity(opacity);
                        }, index * 500);
                    });
                    
                    // Go to interaction screen after fade out
                    setTimeout(() => {
                        if (onGoToInteraction) {
                            onGoToInteraction(playerName);
                        } else {
                            onContinue(playerName); // Fallback
                        }
                    }, fadeOutSteps.length * 500);
                    break;
            }
            setDialogIndex(0);
        }
    };

    const handleYesClick = () => {
        if (currentPhase === 'intro') {
            setCurrentPhase('name');
            setDialogIndex(0);
        } else if (currentPhase === 'introNo') {
            setCurrentPhase('introNo'); // Repeat introNo to try to convince them
            setDialogIndex(0);
        } else if (currentPhase === 'explanation') {
            setCurrentPhase('chooseMoonoko');
            setDialogIndex(0);
        } else if (currentPhase === 'explanationNo') {
            setCurrentPhase('chooseMoonoko');
            setDialogIndex(0);
        } else if (currentPhase === 'mintMore') {
            // Continue to final phase (YES = done)
            setCurrentPhase('final');
            setDialogIndex(0);
        }
    };

    const handleNoClick = () => {
        if (currentPhase === 'intro') {
            setCurrentPhase('introNo');
            setDialogIndex(0);
        } else if (currentPhase === 'introNo') {
            setCurrentPhase('name');
            setDialogIndex(0);
        } else if (currentPhase === 'explanation') {
            setCurrentPhase('explanationNo');
            setDialogIndex(0);
        } else if (currentPhase === 'explanationNo') {
            setCurrentPhase('chooseMoonoko');
            setDialogIndex(0);
        } else if (currentPhase === 'mintMore') {
            // Go back to selection screen (NO = mint more)
            if (onGoToSelection) {
                onGoToSelection(currentPhase);
            }
        }
    };

    const handleNameSubmit = () => {
        if (playerName.trim().length > 0) {
            setCurrentPhase('explanation');
            setDialogIndex(0);
        }
    };



    const getCurrentDialog = () => {
        if (currentPhase === 'name') {
            return "Ohhhh thank you! But first, what's your name?";
        } else if (currentPhase === 'explanation') {
            return processedDialogs.explanation[dialogIndex];
        } else if (currentPhase === 'explanationNo') {
            return processedDialogs.explanationNo[dialogIndex];
        } else if (currentPhase === 'mintMore') {
            return processedDialogs.mintMore[dialogIndex];
        } else if (currentPhase === 'final') {
            return processedDialogs.final[dialogIndex];
        } else {
            return processedDialogs[currentPhase]?.[dialogIndex] || "";
        }
    };

    const showYesNoButtons = (currentPhase === 'intro' && dialogIndex === processedDialogs.intro.length - 1) || 
                            (currentPhase === 'introNo' && dialogIndex === processedDialogs.introNo.length - 1) ||
                            (currentPhase === 'explanation' && dialogIndex === processedDialogs.explanation.length - 1) ||
                            (currentPhase === 'explanationNo' && dialogIndex === processedDialogs.explanationNo.length - 1) ||
                            (currentPhase === 'mintMore' && dialogIndex === processedDialogs.mintMore.length - 1);
    const showNameInput = currentPhase === 'nameInput';

    // Typewriter effect for dialog text
    useEffect(() => {
        const currentDialog = getCurrentDialog();
        
        if (currentDialog) {
            // Set dialog changing flag immediately
            setIsDialogChanging(true);
            
            // Small delay to ensure state is properly updated
            setTimeout(() => {
                setIsTyping(true);
                setIsDialogChanging(false);
                setSegmentIndex(0);
                setCharIndex(0);
                segmentIndexRef.current = 0;
                charIndexRef.current = 0;
                
                const segments = processTextToSegments(currentDialog);
                setDisplaySegments(segments);
                
                const typeInterval = setInterval(() => {
                    const currentSegment = segments[segmentIndexRef.current];
                    if (!currentSegment) {
                        setIsTyping(false);
                        clearInterval(typeInterval);
                        return;
                    }
                    
                    if (charIndexRef.current < currentSegment.text.length) {
                        charIndexRef.current += 1;
                        setCharIndex(charIndexRef.current);
                    } else {
                        // Move to next segment
                        if (segmentIndexRef.current < segments.length - 1) {
                            segmentIndexRef.current += 1;
                            charIndexRef.current = 0;
                            setSegmentIndex(segmentIndexRef.current);
                            setCharIndex(0);
                        } else {
                            // Finished typing
                            setIsTyping(false);
                            clearInterval(typeInterval);
                        }
                    }
                }, 50);
                
                return () => clearInterval(typeInterval);
            }, 100);
        } else {
            // Reset when no dialog or empty dialog
            setDisplaySegments([]);
            setSegmentIndex(0);
            setCharIndex(0);
            setIsTyping(false);
        }
    }, [dialogIndex, currentPhase, showYesNoButtons]);

    // Handle delay for showing options after typing completes
    useEffect(() => {
        if (showYesNoButtons && !isTyping && !isDialogChanging) {
            const timer = setTimeout(() => {
                setShowOptionsAfterDelay(true);
            }, 100); // 100ms delay
            return () => clearTimeout(timer);
        } else {
            setShowOptionsAfterDelay(false);
        }
    }, [showYesNoButtons, isTyping, isDialogChanging]);

    // Prevent showing choice dialog during dialog transitions
    const showChoiceDialog = showYesNoButtons && !isTyping && !isDialogChanging && showOptionsAfterDelay;

    // Arrow animation effect - only show after typing is complete
    useEffect(() => {
        if (!showYesNoButtons && !isTyping) {
            const interval = setInterval(() => {
                setArrowOpacity(prev => prev === 1 ? 0.3 : 1);
            }, 500); // Faster blink every 500ms
            
            return () => clearInterval(interval);
        } else {
            setArrowOpacity(0); // Hide arrow while typing
        }
    }, [showYesNoButtons, isTyping]);

    const handleLeftButton = () => {
        if (showChoiceDialog) {
            setSelectedChoice('yes');
        } else if (showNameInput) {
            handleNameSubmit();
        }
        // Only center button progresses text for non-choice dialogs
    };

    const handleRightButton = () => {
        if (showChoiceDialog) {
            setSelectedChoice('no');
        } else if (showNameInput) {
            handleNameSubmit();
        }
        // Only center button progresses text for non-choice dialogs
    };

    const handleCenterButton = () => {
        if (showChoiceDialog) {
            if (selectedChoice === 'yes') {
                handleYesClick();
            } else {
                handleNoClick();
            }
        } else if (showNameInput) {
            handleNameSubmit();
        } else if (isTyping) {
            // Complete the typewriter animation immediately
            const currentSegment = displaySegments[segmentIndex];
            if (currentSegment) {
                setCharIndex(currentSegment.text.length);
                charIndexRef.current = currentSegment.text.length;
                
                // If there are more segments, move to the next one
                if (segmentIndex < displaySegments.length - 1) {
                    setSegmentIndex(segmentIndex + 1);
                    segmentIndexRef.current = segmentIndex + 1;
                    setCharIndex(0);
                    charIndexRef.current = 0;
                } else {
                    // All segments are complete, finish typing
                    setIsTyping(false);
                }
            }
        } else {
            handleDialogClick();
        }
    };



    return (
        <InnerScreen
            showStatsBar={false}
            onLeftButtonPress={handleLeftButton}
            onCenterButtonPress={handleCenterButton}
            onRightButtonPress={handleRightButton}
            leftButtonText={showChoiceDialog ? '' : ''}
            centerButtonText={showChoiceDialog ? '' : ''}
            rightButtonText={showChoiceDialog ? '' : ''}
            centerButtonDisabled={showNameInput && playerName.trim().length === 0}
            isTransitioning={isTransitioning}
            transitionOpacity={transitionOpacity}
        >
            {currentPhase !== 'nameInput' && (
                <>
                    <View style={styles.storyCharacterCentered}>
                        <Image
                            source={require('../../assets/images/hoshino star.gif')}
                            style={styles.starCharacterImage}
                        />
                    </View>

                    <View style={styles.storySection}>
                        {/* Dialog shadow that extends to bottom of screen */}
                        <View style={styles.dialogShadow} />
                        <View
                            style={styles.storyDialogBottom}
                            onLayout={(e) => setDialogContainerWidth(e.nativeEvent.layout.width)}
                        >
                            {dialogContainerWidth > 0 && (
                            <Frame
                                width={dialogContainerWidth - 50}
                                height={70}
                                top={-34}
                                left={25}
                                position="absolute"
                                pixelSize={2}
                            >
                                <View style={styles.dialogContentContainer}>
                                    <View style={styles.dialogTextContainer}>
                                        {renderSegments(displaySegments, segmentIndex, charIndex)}
                                    </View>
                                    {showChoiceDialog && (
                                        <View style={styles.choiceContainer}>
                                            <Text style={[styles.choiceText, selectedChoice === 'yes' && styles.selectedChoice]}>
                                                YES
                                            </Text>
                                            <Text style={styles.choiceText}>  </Text>
                                            <Text style={[styles.choiceText, selectedChoice === 'no' && styles.selectedChoice]}>
                                                NO
                                            </Text>
                                        </View>
                                    )}
                                    {!showYesNoButtons && !isTyping && (
                                        <View style={[styles.continueArrow, { opacity: arrowOpacity }]}>
                                        </View>
                                    )}
                                </View>
                            </Frame>
                            )}
                        </View>
                    </View>
                </>
            )}

            {showNameInput && (
                <>
                    <View style={styles.eyesSection}>
                        <Image
                            source={require('../../assets/images/eyes.png')}
                            style={styles.eyesImage}
                        />
                    </View>

                    <View style={styles.nameInputSection}>
                        <View style={styles.nameInputContainer}>
                            <View style={styles.nameInputTop}>
                                <View style={styles.nameDisplayContainer}>
                                    <View style={styles.nameInputOuterBox}>
                                        <View style={styles.nameInputInnerBox}>
                                            <Text style={styles.namePrompt}>Tell me your name!</Text>
                                            <Text style={styles.nameDisplay}>
                                                {playerName.padEnd(9, '*')}
                                            </Text>
                                            <TextInput
                                                style={styles.hiddenInput}
                                                value={playerName}
                                                onChangeText={setPlayerName}
                                                placeholder=""
                                                maxLength={9}
                                                autoFocus={true}
                                                onSubmitEditing={handleNameSubmit}
                                                returnKeyType="done"
                                            />
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                </>
            )}



            {currentPhase === 'complete' && (
                <View style={styles.completeSection}>
                    <View style={styles.starCharacterSection}>
                        <Image
                            source={require('../../assets/images/hoshino star.png')}
                            style={styles.starCharacterImage}
                        />
                    </View>
                    <View style={styles.completionMessage}>
                        <Text style={styles.welcomePlayer}>Welcome, {playerName}!</Text>
                        <Text style={styles.transitionText}>
                            {connected ? 'Entering the cosmic realm...' : 'Please connect your Solflare wallet to continue'}
                        </Text>
                    </View>
                </View>
            )}
        </InnerScreen>
    );
};

const styles = StyleSheet.create({
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statLabel: {
        color: 'white',
        fontSize: 12,
    },
    starRating: {
        color: 'yellow',
        fontSize: 12,
    },
    storySection: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        position: 'relative',
    },
    storyCharacterCentered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        marginTop: 80, // Increased from 30 to move star down
    },
    dialogShadow: {
        position: 'absolute',
        top: '50%', // Start from middle of screen (where dialog is)
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.2)', // Subtle shadow
        zIndex: 1,
    },
    storyDialogBottom: {
        position: 'absolute',
        bottom: 45,
        left: 0,
        right: 0,
        width: '100%',
        padding: 5,
        backgroundColor: 'transparent',
        zIndex: 2,
    },
    storyDialogueLargeBox: {
        backgroundColor: '#E8F5E8', // Light pastel green background
        padding: 0, // Remove padding to create pixelated border effect
        borderRadius: 0, // Remove rounded corners for pixelated look
        borderWidth: 0, // Remove CSS border - we'll use pixelated borders
        // Fixed size dialog box
        width: isTablet ? 400 : 300,
        height: isTablet ? 140 : 120,
        alignSelf: 'center',
        position: 'relative',
        overflow: 'visible', // Allow pixelated borders to show
    },
    storyDialogueInnerBox: {
        backgroundColor: '#E8F5E8',
        padding: 0,
        borderRadius: 0, // Remove rounded corners for pixelated look
        borderWidth: 0, // Remove CSS border - we'll use pixelated borders
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'visible', // Allow pixelated borders to show
    },
    storySpeakerLarge: {
        fontWeight: 'bold',
        fontSize: 16,
        color: '#2E5A3E', // Dark green text
        marginBottom: 5,
    },
    storyTextLarge: {
        fontSize: 11,
        color: '#2E5A3E', // Dark green text
        lineHeight: 18,
        fontFamily: 'PressStart2P',
        letterSpacing: -1, // Reduce space between characters
    },
    boldText: {
        fontSize: 16,
        fontFamily: 'PressStart2P',
    },
    storyTextContainer: {
        width: '100%',
    },
    centeredText: {
        textAlign: 'center',
        width: '100%',
    },
    centeredSegmentContainer: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    storyPromptLarge: {
        fontSize: 12,
        color: '#4A7A5A', // Medium green for subtle text
        marginTop: 5,
        fontStyle: 'italic',
        fontFamily: 'PressStart2P',
    },
    starCharacterSection: {
        height: isTablet ? 450 : 350,
        justifyContent: 'center',
        alignItems: 'center',
    },
    starCharacterImage: {
        width: isTablet ? 250 : 200,
        height: isTablet ? 250 : 200,
        resizeMode: 'contain',
        marginLeft: 0,
    },
    eyesSection: {
        height: isTablet ? 60 : 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 5,
    },
    eyesImage: {
        width: isTablet ? 150 : 100,
        height: isTablet ? 75 : 50,
        resizeMode: 'contain',
    },
    nameInputSection: {
        padding: 0,
        justifyContent: 'flex-start',
        paddingTop: 0,
    },
    nameInputContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    nameInputTop: {
        alignItems: 'center',
        width: '100%',
    },
    namePrompt: {
        fontSize: isTablet ? 16 : 13,
        marginBottom: 2,
        textAlign: 'center',
        color: '#2E5A3E', // Same dark green as the input text
        fontFamily: 'PressStart2P',
    },
    nameDisplayContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        maxWidth: 320,
        position: 'relative',
    },
    nameDisplay: {
        fontSize: isTablet ? 28 : 14,
        textAlign: 'center',
        color: '#2E5A3E', // Dark green text to match border
        letterSpacing: 2,
        width: '100%',
        lineHeight: isTablet ? 28 : 24,
        includeFontPadding: false,
        textAlignVertical: 'center',
        fontFamily: 'PressStart2P',
        flexWrap: 'nowrap',
    },
    hiddenInput: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: 0,
        zIndex: 1,
    },
    completeSection: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    completionMessage: {
        alignItems: 'center',
        padding: 20,
    },
    welcomePlayer: {
        fontSize: isTablet ? 28 : 24,
        marginBottom: 10,
        fontFamily: 'PressStart2P',
    },
    transitionText: {
        fontSize: isTablet ? 18 : 16,
        fontFamily: 'PressStart2P',
    },
    nameInputOuterBox: {
        width: '80%',
        maxWidth: 250,
        alignSelf: 'center',
        borderWidth: 2,
        borderColor: '#2E5A3E', // Dark teal outer border
        borderRadius: 6, // Less rounded for more pixelated look
        padding: 3, // Small padding for inner border
        backgroundColor: '#E8F5E8', // Off-white background between borders
    },
    nameInputInnerBox: {
        backgroundColor: '#E8F5E8',
        padding: 15, // Increased padding
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#4A7A5A', // Medium teal inner border
        width: '100%',
        height: 80, // Increased height from 50 to 70
        justifyContent: 'center',
        alignItems: 'center',
        display: 'flex',
    },
    choiceContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 0,
        marginHorizontal: 30,
        position: 'absolute',
        bottom: 8, // Moved up 3px from 3 to 6
        left: 0,
        right: 0,
    },
    choiceText: {
        fontSize: 13,
        color: '#4A7A5A', // Medium green for choice text
        marginHorizontal: 30, // Increased horizontal spacing instead of gap
        fontFamily: 'PressStart2P',
        opacity: 0.5, // Make non-underlined options transparent
    },
    selectedChoice: {
        color: '#2E5A3E', // Dark green for selected choice
        fontFamily: 'PressStart2P',
        opacity: 1, // Make selected option fully opaque
    },
    continueArrow: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        width: 0,
        height: 0,
        borderLeftWidth: 6, // Reduced from 8 to 6
        borderRightWidth: 6, // Reduced from 8 to 6
        borderTopWidth: 8, // Reduced from 12 to 8
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#2E5A3E',
    },
    arrowText: {
        fontSize: 20,
        color: 'white',
    },
    dialogContentContainer: {
        position: 'absolute',
        top: -9,
        left: -11,
        right: -11,
        bottom: -11,
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        paddingLeft: 10,
        paddingTop: 5,
        paddingRight: 10,
        backgroundColor: '#E8F5E8',
    },
    dialogTextContainer: {
        flex: 1, // Take up available space for text
        marginTop: 9,
        marginLeft: 8,
        marginRight: 15,
        minHeight: 44,
    },

    // Outer pixelated border system for dialog box
    dialogBorderTop: {
        position: 'absolute',
        top: 0,
        left: 6,
        right: 6,
        height: 3,
        backgroundColor: '#2E5A3E', // Dark green outer border
        zIndex: 10,
    },
    dialogBorderBottom: {
        position: 'absolute',
        bottom: 0,
        left: 6,
        right: 6,
        height: 3,
        backgroundColor: '#2E5A3E',
        zIndex: 10,
    },
    dialogBorderLeft: {
        position: 'absolute',
        top: 3,
        bottom: 3,
        left: 0,
        width: 3,
        backgroundColor: '#2E5A3E',
        zIndex: 10,
    },
    dialogBorderRight: {
        position: 'absolute',
        top: 3,
        bottom: 3,
        right: 0,
        width: 3,
        backgroundColor: '#2E5A3E',
        zIndex: 10,
    },

    // Inner pixelated border system for dialog box
    dialogBorderInnerTop: {
        position: 'absolute',
        top: 8,
        left: 8,
        right: 8,
        height: 4,
        backgroundColor: '#4A7A5A', // Medium green inner border
        zIndex: 11,
    },
    dialogBorderInnerBottom: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        right: 8,
        height: 4,
        backgroundColor: '#4A7A5A',
        zIndex: 11,
    },
    dialogBorderInnerLeft: {
        position: 'absolute',
        top: 8,
        bottom: 8,
        left: 8,
        width: 4,
        backgroundColor: '#4A7A5A',
        zIndex: 11,
    },
    dialogBorderInnerRight: {
        position: 'absolute',
        top: 8,
        bottom: 8,
        right: 8,
        width: 4,
        backgroundColor: '#4A7A5A',
        zIndex: 11,
    },

    // Main corner pixels for dialog box
    dialogCornerTL: {
        position: 'absolute',
        top: 3,
        left: 3,
        width: 6,
        height: 6,
        backgroundColor: '#2E5A3E', // Dark green outer corners
        zIndex: 10,
    },
    dialogCornerTR: {
        position: 'absolute',
        top: 3,
        right: 3,
        width: 6,
        height: 6,
        backgroundColor: '#2E5A3E',
        zIndex: 10,
    },
    dialogCornerBL: {
        position: 'absolute',
        bottom: 3,
        left: 3,
        width: 6,
        height: 6,
        backgroundColor: '#2E5A3E',
        zIndex: 10,
    },
    dialogCornerBR: {
        position: 'absolute',
        bottom: 3,
        right: 3,
        width: 6,
        height: 6,
        backgroundColor: '#2E5A3E',
        zIndex: 10,
    },

    // Additional corner detail pixels for dialog box
    dialogCornerPixelTL1: {
        position: 'absolute',
        top: 4,
        left: 12,
        width: 3,
        height: 3,
        backgroundColor: '#4A7A5A', // Medium green inner corner pixels
        zIndex: 11,
    },
    dialogCornerPixelTL2: {
        position: 'absolute',
        top: 12,
        left: 4,
        width: 3,
        height: 3,
        backgroundColor: '#4A7A5A',
        zIndex: 11,
    },
    dialogCornerPixelTR1: {
        position: 'absolute',
        top: 4,
        right: 12,
        width: 3,
        height: 3,
        backgroundColor: '#4A7A5A',
        zIndex: 11,
    },
    dialogCornerPixelTR2: {
        position: 'absolute',
        top: 12,
        right: 4,
        width: 3,
        height: 3,
        backgroundColor: '#4A7A5A',
        zIndex: 11,
    },
    dialogCornerPixelBL1: {
        position: 'absolute',
        bottom: 4,
        left: 12,
        width: 3,
        height: 3,
        backgroundColor: '#4A7A5A',
        zIndex: 11,
    },
    dialogCornerPixelBL2: {
        position: 'absolute',
        bottom: 12,
        left: 4,
        width: 3,
        height: 3,
        backgroundColor: '#4A7A5A',
        zIndex: 11,
    },
    dialogCornerPixelBR1: {
        position: 'absolute',
        bottom: 4,
        right: 12,
        width: 3,
        height: 3,
        backgroundColor: '#4A7A5A',
        zIndex: 11,
    },
    dialogCornerPixelBR2: {
        position: 'absolute',
        bottom: 12,
        right: 4,
        width: 3,
        height: 3,
        backgroundColor: '#4A7A5A',
        zIndex: 11,
    },


});

export default WelcomeScreen;