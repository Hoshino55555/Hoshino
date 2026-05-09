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
import chatService from '../services/ChatService';
import { getCharacterAnim } from '../assets';
import { useGameStateContext } from '../contexts/GameStateContext';

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

const getImageSource = (imageName: string) => getCharacterAnim(imageName);

// Local placeholder for the AI capacity meter. Swap this for a server-side
// quota surface (daily message budget / token bucket) once exposed.
const SESSION_AI_BUDGET = 30;
const CAPACITY_SEGMENTS = 30;

// PictoChat-style name handle. Lowercases, strips non-alphanum, caps the
// length so the pill stays a fixed width regardless of the source name.
const namePlateHandle = (name: string): string => {
    const cleaned = (name || 'user').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    return cleaned.slice(0, 8) || 'user';
};

const CharacterChat = ({ character, onExit, playerName, onNotification }: Props) => {
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    // Track the soft keyboard height directly. We can't rely on adjustResize
    // alone because Android 14+ edge-to-edge mode reports the IME via window
    // insets without shrinking the activity, so KeyboardAvoidingView is a
    // no-op. Lifting the input bar by this height lands it just above the
    // keyboard on every recent Android version.
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [capacityVisible, setCapacityVisible] = useState(false);
    const [capacityTrackHeight, setCapacityTrackHeight] = useState(0);
    const [typingDots, setTypingDots] = useState(0);
    const messagesEndRef = useRef<ScrollView>(null);
    const capacityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { chat: bumpChatMood } = useGameStateContext();

    const toggleCapacityBar = () => {
        if (capacityTimerRef.current) {
            clearTimeout(capacityTimerRef.current);
            capacityTimerRef.current = null;
        }
        setCapacityVisible((prev) => {
            if (prev) return false;
            capacityTimerRef.current = setTimeout(
                () => setCapacityVisible(false),
                3500,
            );
            return true;
        });
    };

    useEffect(() => {
        return () => {
            if (capacityTimerRef.current) clearTimeout(capacityTimerRef.current);
        };
    }, []);

    // Cycle the typing-indicator dots (0 → 1 → 2 → 3 → 0) while a response
    // is in flight, so the row reads as actively-being-typed instead of a
    // static placeholder.
    useEffect(() => {
        if (!isThinking) {
            setTypingDots(0);
            return;
        }
        const id = setInterval(() => {
            setTypingDots((d) => (d + 1) % 4);
        }, 350);
        return () => clearInterval(id);
    }, [isThinking]);

    const handleClose = () => {
        Keyboard.dismiss();
        onExit();
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

        // Sending a message bonds the player with their moonoko — fire and
        // forget the server-side mood bump so a slow callable doesn't delay
        // the AI response. Server clamps mood at 5 and rejects while the
        // moonoko is sleeping (chat UI is unreachable during sleep anyway).
        bumpChatMood().catch((e) => console.warn('chat mood update failed', e));

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
        <View style={{ flex: 1, backgroundColor: '#1a1a1a' }} testID="chat-screen">
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={0}
            >
                <View style={styles.paperBg}>
                    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
                        <TouchableOpacity
                            style={styles.headerSideButton}
                            onPress={handleClose}
                            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                        >
                            <Text style={styles.headerSideText}>{'<'}</Text>
                        </TouchableOpacity>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {character.name}
                        </Text>
                        <View style={styles.headerSideButton} />
                    </View>

                    <View style={styles.body}>
                        {capacityVisible && (() => {
                            const userMessageCount = messages.filter(
                                (m) => m.sender === 'user'
                            ).length;
                            const usedRatio = Math.min(
                                1,
                                userMessageCount / SESSION_AI_BUDGET
                            );
                            const filledSegments = Math.round(
                                usedRatio * CAPACITY_SEGMENTS
                            );
                            // Compute an integer pixel height per segment from
                            // the measured track. flex:1 distributes fractional
                            // pixels and Android rounds them inconsistently,
                            // which makes the stack look ragged. We allocate a
                            // fixed slot height (segment + gap) so every chip
                            // is identical.
                            const SEG_GAP = 2;
                            const slot = capacityTrackHeight > 0
                                ? Math.max(
                                      3,
                                      Math.floor(capacityTrackHeight / CAPACITY_SEGMENTS)
                                  )
                                : 0;
                            const chipHeight = Math.max(1, slot - SEG_GAP);
                            const usedPct = Math.round(usedRatio * 100);
                            return (
                                <View style={styles.capacityBar} pointerEvents="none">
                                    <Text style={styles.capacityPct}>{usedPct}%</Text>
                                    <Text style={styles.capacityLabel}>USED</Text>
                                    <View
                                        style={styles.capacityTrack}
                                        onLayout={(e) =>
                                            setCapacityTrackHeight(e.nativeEvent.layout.height)
                                        }
                                    >
                                        {slot > 0 &&
                                            Array.from({ length: CAPACITY_SEGMENTS }).map(
                                                (_, i) => {
                                                    // Each slot has a fixed integer height. The
                                                    // colored chip lives inside it, leaving the
                                                    // bottom SEG_GAP px transparent so every
                                                    // gap is identical (no margin rounding).
                                                    const edgeIndex =
                                                        CAPACITY_SEGMENTS - filledSegments;
                                                    const isFilled = i >= edgeIndex;
                                                    const isEdge =
                                                        isFilled && i === edgeIndex;
                                                    return (
                                                        <View
                                                            key={i}
                                                            style={[
                                                                styles.capacitySlot,
                                                                { height: slot },
                                                            ]}
                                                        >
                                                            <View
                                                                style={[
                                                                    styles.capacitySegment,
                                                                    { height: chipHeight },
                                                                    isEdge
                                                                        ? styles.capacitySegmentEdge
                                                                        : isFilled
                                                                        ? styles.capacitySegmentOn
                                                                        : styles.capacitySegmentOff,
                                                                ]}
                                                            />
                                                        </View>
                                                    );
                                                }
                                            )}
                                    </View>
                                </View>
                            );
                        })()}

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

                            {messages.map((message) => {
                                const isUser = message.sender === 'user';
                                const handle = namePlateHandle(
                                    isUser ? playerName || 'user' : character.name
                                );
                                return (
                                    <Pressable
                                        key={message.id}
                                        onLongPress={() => copyMessage(message.text)}
                                        delayLongPress={350}
                                        style={({ pressed }) => [
                                            styles.row,
                                            pressed && styles.rowPressed,
                                        ]}
                                    >
                                        <View
                                            style={[
                                                styles.namePill,
                                                isUser ? styles.userPill : styles.characterPill,
                                            ]}
                                        >
                                            <Text style={styles.namePillText}>{handle}</Text>
                                        </View>
                                        <View style={styles.messageBox}>
                                            <Text style={styles.rowText} selectable>
                                                {message.text}
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })}

                            {isThinking && (
                                <View style={styles.row}>
                                    <View style={[styles.namePill, styles.characterPill]}>
                                        <Text style={styles.namePillText}>
                                            {namePlateHandle(character.name)}
                                        </Text>
                                    </View>
                                    <View style={styles.messageBox}>
                                        <Text style={styles.rowText}>
                                            {character.name} is typing
                                            {'.'.repeat(typingDots)}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </ScrollView>
                    </View>

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
                            <TouchableOpacity
                                onPress={toggleCapacityBar}
                                hitSlop={{ top: 8, right: 4, bottom: 8, left: 4 }}
                                style={[
                                    styles.namePill,
                                    styles.userPill,
                                    styles.inputNamePill,
                                ]}
                            >
                                <Text style={styles.namePillText}>
                                    {namePlateHandle(playerName || 'user')}
                                </Text>
                            </TouchableOpacity>
                            <TextInput
                                style={styles.textInput}
                                value={inputText}
                                onChangeText={setInputText}
                                placeholder={`Message ${character.name}...`}
                                placeholderTextColor="#9a8b6a"
                                multiline
                                maxLength={500}
                            />
                            <TouchableOpacity
                                onPress={sendMessage}
                                disabled={!inputText.trim() || isThinking}
                                style={[
                                    styles.sendButton,
                                    (!inputText.trim() || isThinking) && styles.sendButtonDisabled,
                                ]}
                            >
                                <Text style={styles.sendButtonText}>SEND</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    paperBg: {
        flex: 1,
        backgroundColor: '#d4d4d4',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        paddingHorizontal: 8,
        paddingBottom: 6,
    },
    headerSideButton: {
        minWidth: 36,
        paddingVertical: 4,
        alignItems: 'center',
    },
    headerSideText: {
        color: '#f5d65f',
        fontFamily: 'Monaco',
        fontSize: 30,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        color: '#f5d65f',
        fontFamily: 'Monaco',
        fontSize: 21,
        letterSpacing: 0.5,
    },
    body: {
        flex: 1,
        flexDirection: 'row',
    },
    capacityBar: {
        position: 'absolute',
        left: 6,
        bottom: 6,
        width: 36,
        height: '38%',
        backgroundColor: '#2a2a2a',
        alignItems: 'stretch',
        paddingTop: 14,
        paddingBottom: 4,
        paddingHorizontal: 2,
        borderWidth: 2,
        borderColor: '#1a1a1a',
        borderRadius: 10,
        zIndex: 10,
    },
    capacityPct: {
        color: '#ffffff',
        fontFamily: 'Monaco',
        fontSize: 20,
        marginBottom: 2,
        textAlign: 'center',
    },
    capacityLabel: {
        color: '#f5d65f',
        fontFamily: 'Monaco',
        fontSize: 11,
        marginBottom: 1,
        textAlign: 'center',
    },
    capacityTrack: {
        flex: 1,
        alignSelf: 'stretch',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        paddingTop: 0,
        paddingBottom: 2,
        paddingHorizontal: 1,
    },
    capacitySlot: {
        width: '100%',
        justifyContent: 'flex-start',
    },
    capacitySegment: {
        width: '100%',
        borderRadius: 2,
    },
    capacitySegmentOn: {
        backgroundColor: '#e093c0',
    },
    capacitySegmentEdge: {
        backgroundColor: '#8a3a6a',
    },
    capacitySegmentOff: {
        backgroundColor: '#9a9a9a',
    },
    messagesContainer: {
        flex: 1,
    },
    messagesContent: {
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    emptyHint: {
        textAlign: 'center',
        color: '#5a4a2a',
        fontFamily: 'Monaco',
        fontSize: 23,
        marginTop: 32,
        paddingHorizontal: 24,
        lineHeight: 19,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 6,
        backgroundColor: '#ffffff',
        borderWidth: 2,
        borderColor: '#1a1a1a',
        borderRadius: 6,
        padding: 3,
        minHeight: 40,
    },
    rowPressed: {
        opacity: 0.7,
    },
    namePill: {
        width: 92,
        height: 30,
        marginRight: 4,
        borderWidth: 2,
        borderColor: '#1a1a1a',
        borderRadius: 5,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    inputNamePill: {
        width: 72,
        marginRight: 6,
        alignSelf: 'center',
    },
    userPill: {
        backgroundColor: '#fff48f',
    },
    characterPill: {
        backgroundColor: '#b0d8ff',
    },
    namePillText: {
        color: '#1a1a1a',
        fontFamily: 'Monaco',
        fontSize: 26,
        letterSpacing: 0.5,
    },
    messageBox: {
        flex: 1,
        paddingHorizontal: 8,
        paddingVertical: 4,
        justifyContent: 'center',
    },
    rowText: {
        color: '#1a1a1a',
        fontFamily: 'Monaco',
        fontSize: 24,
        lineHeight: 21,
    },
    inputContainer: {
        paddingHorizontal: 8,
        paddingTop: 8,
        borderTopWidth: 2,
        borderTopColor: '#2a2a2a',
        backgroundColor: '#f7ebcb',
    },
    inputBorder: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: '#fff8df',
        borderWidth: 2,
        borderColor: '#2a2a2a',
        padding: 4,
    },
    textInput: {
        flex: 1,
        color: '#2a2a2a',
        fontFamily: 'Monaco',
        fontSize: 24,
        paddingHorizontal: 8,
        paddingVertical: 6,
        maxHeight: 120,
        minHeight: 36,
    },
    sendButton: {
        marginLeft: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#1a1a1a',
        borderWidth: 2,
        borderColor: '#2a2a2a',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonDisabled: {
        opacity: 0.4,
    },
    sendButtonText: {
        color: '#f5d65f',
        fontFamily: 'Monaco',
        fontSize: 23,
    },
});

export default CharacterChat;
