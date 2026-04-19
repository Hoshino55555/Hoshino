import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import InnerScreen from './InnerScreen';
import chatService from '../services/ChatService';

interface Character {
    id: string;
    name: string;
    description: string;
    image: string;
    element: string;
    baseStats: {
        mood: number;
        hunger: number;
        energy: number;
    };
    rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
    specialAbility: string;
    nftMint?: string | null;
}

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'character';
    timestamp: Date;
}

interface Props {
    character: Character;
    onExit: () => void;
    playerName?: string;
    onNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const CharacterChat = ({ character, onExit, playerName, onNotification }: Props) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [showChat, setShowChat] = useState(true);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const messagesEndRef = useRef<ScrollView>(null);

    // Keyboard event listeners
    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
            setKeyboardVisible(true);
        });
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardVisible(false);
        });

        return () => {
            keyboardDidShowListener?.remove();
            keyboardDidHideListener?.remove();
        };
    }, []);

    // Helper function to get image source based on character image name
    const getImageSource = (imageName: string) => {
        switch (imageName) {
            case 'LYRA.gif':
                return require('../../assets/images/LYRA.gif');
            case 'ORION.gif':
                return require('../../assets/images/ORION.gif');
            case 'ARO.gif':
                return require('../../assets/images/ARO.gif');
            case 'SIRIUS.gif':
                return require('../../assets/images/SIRIUS.gif');
            case 'ZANIAH.gif':
                return require('../../assets/images/ZANIAH.gif');
            default:
                return require('../../assets/images/LYRA.gif'); // fallback
        }
    };

    // Auto-scroll to bottom when new messages are added
    useEffect(() => {
        messagesEndRef.current?.scrollToEnd({ animated: true });
    }, [messages]);

    // Generate character response using Firebase AI
    const generateCharacterResponse = async (userInput: string): Promise<string> => {
        try {
            // Always set a user ID (use playerName or fallback to 'anonymous')
            const userId = playerName || 'anonymous';
            chatService.setUserId(userId);

            // Get moonoko ID from character name
            const moonokoId = character.name.toLowerCase();
            
            // Send message to Firebase AI service
            const response = await chatService.sendMessage(userInput, moonokoId);
            
            if (response.success) {
                return response.message;
            } else {
                throw new Error(response.message || 'Failed to get AI response');
            }
        } catch (error) {
            console.error('AI response error:', error);
            // Fallback to a simple response if AI fails
            return `I'm having trouble connecting right now, ${playerName || 'friend'}. But I'm still here for you! ✨`;
        }
    };

    const sendMessage = async () => {
        if (!inputText.trim()) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            text: inputText.trim(),
            sender: 'user',
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputText('');
        setIsThinking(true);

        try {
            const characterResponse = await generateCharacterResponse(inputText);

            const characterMessage: Message = {
                id: (Date.now() + 1).toString(),
                text: characterResponse,
                sender: 'character',
                timestamp: new Date()
            };

            setMessages(prev => [...prev, characterMessage]);
        } catch (error) {
            console.error('Error generating response:', error);
            onNotification?.('❌ Failed to generate response', 'error');
        } finally {
            setIsThinking(false);
        }
    };

    const toggleChat = () => {
        setShowChat(!showChat);
    };

    return (
        <InnerScreen
            onLeftButtonPress={onExit}
            onCenterButtonPress={toggleChat}
            onRightButtonPress={() => onNotification?.('💬 Chat Tips: Ask questions, share thoughts, or just chat naturally!', 'info')}
            leftButtonText=""
            centerButtonText=""
            rightButtonText=""
            keyboardVisible={keyboardVisible}
        >
            {/* Main Display Area - Always show character, optionally overlay chat */}
            <View style={styles.container}>
                {/* Character Display - Always visible */}
                <View style={styles.characterDisplay}>
                    <Image
                        source={getImageSource(character.image)}
                        style={styles.characterImage}
                    />
                    {!showChat && (
                        <View style={styles.characterInfo}>
                            <Text style={styles.characterName}>{character.name}</Text>
                            <Text style={styles.characterStatus}>✨ Ready to chat! ✨</Text>
                        </View>
                    )}
                </View>

                {/* Chat Interface - Only show when toggled on */}
                {showChat && (
                    <View style={styles.chatContainer}>
                        {/* Cosmic Background Effect */}
                        <View style={styles.cosmicBackground}>
                            {/* Simulated stars */}
                            <View style={[styles.star, { top: '10%', left: '15%' }]} />
                            <View style={[styles.star, { top: '25%', right: '20%' }]} />
                            <View style={[styles.star, { top: '60%', left: '10%' }]} />
                            <View style={[styles.star, { bottom: '30%', right: '15%' }]} />
                            <View style={[styles.star, { bottom: '15%', left: '25%' }]} />
                        </View>

                        {/* Chat Header */}
                        <View style={styles.chatHeader}>
                            <View style={styles.headerBorder}>
                                <Text style={styles.chatHeaderText}>✨ Chatting with {character.name} ✨</Text>
                            </View>
                        </View>

                        {/* Messages Area */}
                        <ScrollView
                            style={styles.messagesContainer}
                            ref={messagesEndRef}
                            contentContainerStyle={{ paddingBottom: 10 }}
                        >
                            {messages.map((message) => (
                                <View
                                    key={message.id}
                                    style={[
                                        styles.message,
                                        message.sender === 'user' ? styles.userMessage : styles.characterMessage
                                    ]}
                                >
                                    <View style={[
                                        styles.messageBorder,
                                        message.sender === 'user' ? styles.userMessageBorder : styles.characterMessageBorder
                                    ]}>
                                        <Text style={[
                                            styles.messageText,
                                            message.sender === 'user' ? styles.userMessageText : styles.characterMessageText
                                        ]}>
                                            {message.text}
                                        </Text>
                                    </View>
                                </View>
                            ))}

                            {isThinking && (
                                <View style={styles.thinkingMessage}>
                                    <View style={styles.thinkingBorder}>
                                        <Text style={styles.thinkingText}>
                                            🌟 {character.name} is thinking...
                                        </Text>
                                        <Text style={styles.thinkingDots}>✨ ✨ ✨</Text>
                                    </View>
                                </View>
                            )}
                        </ScrollView>

                        {/* Input Area */}
                        <View style={styles.inputContainer}>
                            <View style={styles.inputBorder}>
                                <TextInput
                                    style={styles.textInput}
                                    value={inputText}
                                    onChangeText={setInputText}
                                    placeholder={`Message ${character.name}...`}
                                    placeholderTextColor="#B8860B"
                                    multiline
                                    maxLength={200}
                                />
                                <TouchableOpacity
                                    style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
                                    onPress={sendMessage}
                                    disabled={!inputText.trim() || isThinking}
                                >
                                    <View style={styles.sendButtonBorder}>
                                        <Text style={styles.sendButtonText}>Send ✨</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}
            </View>
        </InnerScreen>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        height: '100%',
        position: 'relative',
    },
    characterDisplay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    characterImage: {
        width: 200,
        height: 200,
        resizeMode: 'contain',
    },
    characterInfo: {
        alignItems: 'center',
        marginTop: 10,
        backgroundColor: 'rgba(25, 25, 112, 0.8)', // Deep space blue
        borderWidth: 2,
        borderColor: '#FFD700', // Cosmic gold
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    characterName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFD700', // Golden yellow
        marginBottom: 2,
        fontFamily: 'monospace',
        letterSpacing: 1,
    },
    characterStatus: {
        fontSize: 12,
        color: '#E6E6FA', // Lavender
        fontFamily: 'monospace',
        letterSpacing: 0.5,
    },
    chatContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(25, 25, 112, 0.95)', // Deep space blue background
        borderWidth: 3,
        borderColor: '#4169E1', // Royal blue border
        borderRadius: 8,
        padding: 4,
        zIndex: 10,
    },
    cosmicBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
    },
    star: {
        position: 'absolute',
        width: 3,
        height: 3,
        backgroundColor: '#FFD700',
        borderRadius: 1.5,
        opacity: 0.8,
    },
    chatHeader: {
        marginBottom: 6,
        zIndex: 2,
    },
    headerBorder: {
        backgroundColor: 'rgba(72, 61, 139, 0.9)', // Dark slate blue
        borderWidth: 2,
        borderColor: '#FFD700', // Golden border
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
    },
    chatHeaderText: {
        color: '#FFD700', // Golden text
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
        fontFamily: 'monospace',
        letterSpacing: 0.5,
    },
    messagesContainer: {
        flex: 1,
        paddingHorizontal: 4,
        zIndex: 2,
    },
    message: {
        marginVertical: 3,
        maxWidth: '85%',
    },
    userMessage: {
        alignSelf: 'flex-end',
    },
    characterMessage: {
        alignSelf: 'flex-start',
    },
    messageBorder: {
        borderWidth: 2,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 4,
    },
    userMessageBorder: {
        backgroundColor: 'rgba(138, 43, 226, 0.8)', // Cosmic purple
        borderColor: '#DA70D6', // Orchid border
    },
    characterMessageBorder: {
        backgroundColor: 'rgba(70, 130, 180, 0.8)', // Steel blue
        borderColor: '#87CEEB', // Sky blue border
    },
    messageText: {
        fontSize: 13,
        lineHeight: 16,
        fontFamily: 'monospace',
    },
    userMessageText: {
        color: '#E6E6FA', // Lavender
    },
    characterMessageText: {
        color: '#F0F8FF', // Alice blue
    },
    thinkingMessage: {
        alignSelf: 'flex-start',
        marginVertical: 3,
    },
    thinkingBorder: {
        borderWidth: 2,
        borderColor: '#FF69B4', // Hot pink for thinking
        backgroundColor: 'rgba(199, 21, 133, 0.6)', // Medium violet red
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 4,
    },
    thinkingText: {
        fontSize: 12,
        color: '#FFB6C1', // Light pink
        fontFamily: 'monospace',
        letterSpacing: 0.5,
        flex: 1,
    },
    thinkingDots: {
        fontSize: 12,
        color: '#FFB6C1',
        fontFamily: 'monospace',
        marginLeft: 8,
    },
    inputContainer: {
        marginTop: 6,
        zIndex: 2,
    },
    inputBorder: {
        borderWidth: 2,
        borderColor: '#4169E1', // Royal blue
        backgroundColor: 'rgba(72, 61, 139, 0.8)', // Dark slate blue
        borderRadius: 6,
        padding: 6,
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    textInput: {
        flex: 1,
        backgroundColor: 'rgba(25, 25, 112, 0.9)', // Deep space blue
        borderWidth: 1,
        borderColor: '#6495ED', // Cornflower blue
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 6,
        marginRight: 6,
        color: '#E6E6FA', // Lavender text
        fontSize: 12,
        fontFamily: 'monospace',
        maxHeight: 60,
        minHeight: 32,
    },
    sendButton: {
        minWidth: 60,
    },
    sendButtonBorder: {
        backgroundColor: 'rgba(138, 43, 226, 0.8)', // Cosmic purple
        borderWidth: 2,
        borderColor: '#DA70D6', // Orchid
        borderRadius: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonText: {
        color: '#E6E6FA', // Lavender
        fontWeight: 'bold',
        fontSize: 12,
        fontFamily: 'monospace',
        letterSpacing: 0.5,
    },
    sendButtonDisabled: {
        opacity: 0.5,
    },
});

export default CharacterChat;