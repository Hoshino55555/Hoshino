import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    TextInput,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import ZoomOutOverlay from './ZoomOutOverlay';
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

const getImageSource = (imageName: string) => {
    switch (imageName) {
        case 'LYRA.gif':
            return require('../../assets/images/anim/LYRA.gif');
        case 'ORION.gif':
            return require('../../assets/images/anim/ORION.gif');
        case 'ARO.gif':
            return require('../../assets/images/anim/ARO.gif');
        case 'SIRIUS.gif':
            return require('../../assets/images/anim/SIRIUS.gif');
        case 'ZANIAH.gif':
            return require('../../assets/images/anim/ZANIAH.gif');
        default:
            return require('../../assets/images/anim/LYRA.gif');
    }
};

const CharacterChat = ({ character, onExit, playerName, onNotification }: Props) => {
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    // Track the soft keyboard height directly. We can't rely on adjustResize
    // alone because Android 14+ edge-to-edge mode reports the IME via window
    // insets without shrinking the activity, so KeyboardAvoidingView is a
    // no-op. Lifting the input bar by this height lands it just above the
    // keyboard on every recent Android version.
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const messagesEndRef = useRef<ScrollView>(null);

    const handleClose = () => {
        if (isClosing) return;
        Keyboard.dismiss();
        setIsClosing(true);
    };

    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvt, (e) => {
            setKeyboardHeight(e.endCoordinates?.height ?? 0);
        });
        const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const copyMessage = async (text: string) => {
        try {
            await Clipboard.setStringAsync(text);
            onNotification?.('Copied to clipboard', 'success');
        } catch {
            onNotification?.('Could not copy message', 'error');
        }
    };

    // Load prior conversation with this character on mount
    useEffect(() => {
        let cancelled = false;
        const loadHistory = async () => {
            try {
                const moonokoId = character.name.toLowerCase();
                const convo = await chatService.getConversation(moonokoId);
                if (cancelled) return;
                const restored: Message[] = (convo.messages || []).map((m, idx) => ({
                    id: `${m.timestamp}-${idx}`,
                    text: m.content,
                    sender: m.role === 'assistant' ? 'character' : 'user',
                    timestamp: new Date(m.timestamp),
                }));
                setMessages(restored);
            } catch (error) {
                console.error('Failed to load chat history:', error);
            }
        };
        loadHistory();
        return () => {
            cancelled = true;
        };
    }, [character.name, playerName]);

    // Auto-scroll to bottom when new messages are added
    useEffect(() => {
        messagesEndRef.current?.scrollToEnd({ animated: true });
    }, [messages]);

    const generateCharacterResponse = async (userInput: string): Promise<string> => {
        try {
            const moonokoId = character.name.toLowerCase();
            const response = await chatService.sendMessage(userInput, moonokoId);
            if (response.success) {
                return response.message;
            } else {
                throw new Error(response.message || 'Failed to get AI response');
            }
        } catch (error) {
            console.error('AI response error:', error);
            return `I'm having trouble connecting right now, ${playerName || 'friend'}. But I'm still here for you! ✨`;
        }
    };

    const sendMessage = async () => {
        if (!inputText.trim()) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            text: inputText.trim(),
            sender: 'user',
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInputText('');
        setIsThinking(true);

        try {
            const characterResponse = await generateCharacterResponse(userMessage.text);

            const characterMessage: Message = {
                id: (Date.now() + 1).toString(),
                text: characterResponse,
                sender: 'character',
                timestamp: new Date(),
            };

            setMessages((prev) => [...prev, characterMessage]);
        } catch (error) {
            console.error('Error generating response:', error);
            onNotification?.('Failed to generate response', 'error');
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <ZoomOutOverlay exiting={isClosing} onExitComplete={onExit} backgroundColor="#0d0f2e">
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={0}
            >
                {/* Cosmic background sparkles — purely decorative, behind everything. */}
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <View style={[styles.star, { top: '8%', left: '12%' }]} />
                    <View style={[styles.star, { top: '14%', right: '18%' }]} />
                    <View style={[styles.star, { top: '40%', left: '6%' }]} />
                    <View style={[styles.star, { top: '55%', right: '10%' }]} />
                    <View style={[styles.star, { bottom: '30%', left: '20%' }]} />
                    <View style={[styles.star, { bottom: '15%', right: '25%' }]} />
                </View>

                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={handleClose}
                        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    >
                        <Text style={styles.headerButtonText}>{'< Back'}</Text>
                    </TouchableOpacity>

                    <View style={styles.headerTitleWrap} />

                    {/* Spacer to balance the Back button on the left. */}
                    <View style={styles.headerSpacer} />
                </View>

                <ScrollView
                    style={styles.messagesContainer}
                    ref={messagesEndRef}
                    contentContainerStyle={styles.messagesContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {messages.length === 0 && !isThinking && (
                        <Text style={styles.emptyHint}>
                            Say hi to {character.name}. Long-press any message to copy it.
                        </Text>
                    )}

                    {messages.map((message) => (
                        <View
                            key={message.id}
                            style={[
                                styles.message,
                                message.sender === 'user' ? styles.userMessage : styles.characterMessage,
                            ]}
                        >
                            <Pressable
                                onLongPress={() => copyMessage(message.text)}
                                delayLongPress={350}
                                style={({ pressed }) => [
                                    styles.messageBorder,
                                    message.sender === 'user'
                                        ? styles.userMessageBorder
                                        : styles.characterMessageBorder,
                                    pressed && styles.messagePressed,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.messageText,
                                        message.sender === 'user'
                                            ? styles.userMessageText
                                            : styles.characterMessageText,
                                    ]}
                                    selectable
                                >
                                    {message.text}
                                </Text>
                            </Pressable>
                        </View>
                    ))}

                    {isThinking && (
                        <View style={styles.thinkingMessage}>
                            <View style={styles.thinkingBorder}>
                                <Text style={styles.thinkingText}>
                                    {character.name} is thinking...
                                </Text>
                                <Text style={styles.thinkingDots}>✦ ✦ ✦</Text>
                            </View>
                        </View>
                    )}
                </ScrollView>

                <View
                    style={[
                        styles.inputContainer,
                        {
                            paddingBottom:
                                keyboardHeight > 0
                                    ? keyboardHeight + insets.bottom + 8
                                    : insets.bottom + 6,
                        },
                    ]}
                >
                    <View style={styles.inputBorder}>
                        <TextInput
                            style={styles.textInput}
                            value={inputText}
                            onChangeText={setInputText}
                            placeholder={`Message ${character.name}...`}
                            placeholderTextColor="#9aa3d0"
                            multiline
                            maxLength={500}
                        />
                        <TouchableOpacity
                            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
                            onPress={sendMessage}
                            disabled={!inputText.trim() || isThinking}
                        >
                            <View style={styles.sendButtonBorder}>
                                <Text style={styles.sendButtonText}>Send</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </ZoomOutOverlay>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    star: {
        position: 'absolute',
        width: 3,
        height: 3,
        backgroundColor: '#FFD700',
        borderRadius: 1.5,
        opacity: 0.6,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(105, 110, 180, 0.4)',
    },
    headerButton: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: 'rgba(72, 61, 139, 0.85)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#FFD700',
        minWidth: 56,
        alignItems: 'center',
    },
    headerButtonText: {
        color: '#FFD700',
        fontFamily: 'PressStart2P',
        fontSize: 10,
    },
    headerSpacer: {
        minWidth: 56,
    },
    headerTitleWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 8,
        overflow: 'hidden',
    },
    headerAvatar: {
        width: 28,
        height: 28,
        marginRight: 8,
        resizeMode: 'contain',
    },
    headerTitle: {
        color: '#FFD700',
        fontFamily: 'PressStart2P',
        fontSize: 12,
        letterSpacing: 0.5,
        flexShrink: 1,
    },
    messagesContainer: {
        flex: 1,
        paddingHorizontal: 8,
    },
    messagesContent: {
        paddingTop: 12,
        paddingBottom: 16,
    },
    emptyHint: {
        textAlign: 'center',
        color: '#b8c6ff',
        fontFamily: 'monospace',
        fontSize: 12,
        marginTop: 32,
        paddingHorizontal: 24,
        lineHeight: 18,
    },
    message: {
        marginVertical: 4,
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
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
    },
    messagePressed: {
        opacity: 0.7,
    },
    userMessageBorder: {
        backgroundColor: 'rgba(138, 43, 226, 0.85)',
        borderColor: '#DA70D6',
    },
    characterMessageBorder: {
        backgroundColor: 'rgba(70, 130, 180, 0.85)',
        borderColor: '#87CEEB',
    },
    messageText: {
        fontSize: 14,
        lineHeight: 19,
        fontFamily: 'monospace',
    },
    userMessageText: {
        color: '#F5F0FF',
    },
    characterMessageText: {
        color: '#F0F8FF',
    },
    thinkingMessage: {
        alignSelf: 'flex-start',
        marginVertical: 4,
    },
    thinkingBorder: {
        borderWidth: 2,
        borderColor: '#FF69B4',
        backgroundColor: 'rgba(199, 21, 133, 0.6)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 6,
    },
    thinkingText: {
        fontSize: 12,
        color: '#FFB6C1',
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
        paddingHorizontal: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(105, 110, 180, 0.4)',
    },
    inputBorder: {
        borderWidth: 2,
        borderColor: '#4169E1',
        backgroundColor: 'rgba(72, 61, 139, 0.85)',
        borderRadius: 8,
        padding: 6,
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    textInput: {
        flex: 1,
        backgroundColor: 'rgba(20, 22, 60, 0.95)',
        borderWidth: 1,
        borderColor: '#6495ED',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginRight: 8,
        color: '#E6E6FA',
        fontSize: 14,
        fontFamily: 'monospace',
        maxHeight: 120,
        minHeight: 40,
    },
    sendButton: {
        minWidth: 64,
    },
    sendButtonBorder: {
        backgroundColor: 'rgba(138, 43, 226, 0.85)',
        borderWidth: 2,
        borderColor: '#DA70D6',
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonText: {
        color: '#F5F0FF',
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
