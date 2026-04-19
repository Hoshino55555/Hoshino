import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useLoginWithEmail, useLoginWithOAuth } from '@privy-io/expo';
import InnerScreen from './InnerScreen';

const LoginScreen: React.FC = () => {
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const {
        sendCode,
        loginWithCode,
        state: emailState,
    } = useLoginWithEmail({
        onError: (error) => {
            setErrorMessage(error.message ?? 'Email login failed');
        },
    });

    const { login: loginWithOAuth, state: oauthState } = useLoginWithOAuth({
        onError: (error) => {
            setErrorMessage(error.message ?? 'Google login failed');
        },
    });

    const isSendingCode = emailState.status === 'sending-code';
    const isAwaitingCode = emailState.status === 'awaiting-code-input';
    const isSubmittingCode = emailState.status === 'submitting-code';
    const isOauthPending = oauthState.status === 'loading';

    const anyPending = isSendingCode || isSubmittingCode || isOauthPending;

    const handleSendCode = async () => {
        setErrorMessage(null);
        if (!email.trim()) {
            setErrorMessage('Enter your email first');
            return;
        }
        try {
            await sendCode({ email: email.trim() });
        } catch {
            // error surfaced via onError
        }
    };

    const handleVerifyCode = async () => {
        setErrorMessage(null);
        if (!code.trim()) {
            setErrorMessage('Enter the code from your email');
            return;
        }
        try {
            await loginWithCode({ code: code.trim() });
        } catch {
            // error surfaced via onError
        }
    };

    const handleGoogle = async () => {
        setErrorMessage(null);
        try {
            await loginWithOAuth({ provider: 'google' });
        } catch {
            // error surfaced via onError
        }
    };

    return (
        <InnerScreen expanded animateIn showBackgroundImage={false}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.container}
            >
                <Text style={styles.title}>Welcome to Hoshino</Text>
                <Text style={styles.subtitle}>Sign in to begin</Text>

                <View style={styles.emailBlock}>
                    <TextInput
                        style={styles.input}
                        placeholder="you@email.com"
                        placeholderTextColor="#9b8dbd"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!isAwaitingCode && !anyPending}
                    />

                    {!isAwaitingCode ? (
                        <TouchableOpacity
                            style={[styles.primaryButton, anyPending && styles.buttonDisabled]}
                            onPress={handleSendCode}
                            disabled={anyPending}
                            activeOpacity={0.8}
                        >
                            {isSendingCode ? (
                                <ActivityIndicator color="#2d1b69" />
                            ) : (
                                <Text style={styles.primaryButtonText}>Email me a code</Text>
                            )}
                        </TouchableOpacity>
                    ) : (
                        <>
                            <TextInput
                                style={styles.input}
                                placeholder="6-digit code"
                                placeholderTextColor="#9b8dbd"
                                value={code}
                                onChangeText={setCode}
                                keyboardType="number-pad"
                                maxLength={6}
                                editable={!isSubmittingCode}
                            />
                            <TouchableOpacity
                                style={[styles.primaryButton, isSubmittingCode && styles.buttonDisabled]}
                                onPress={handleVerifyCode}
                                disabled={isSubmittingCode}
                                activeOpacity={0.8}
                            >
                                {isSubmittingCode ? (
                                    <ActivityIndicator color="#2d1b69" />
                                ) : (
                                    <Text style={styles.primaryButtonText}>Verify</Text>
                                )}
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or</Text>
                    <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                    style={[styles.oauthButton, anyPending && styles.buttonDisabled]}
                    onPress={handleGoogle}
                    disabled={anyPending}
                    activeOpacity={0.8}
                >
                    {isOauthPending ? (
                        <ActivityIndicator color="#2d1b69" />
                    ) : (
                        <Text style={styles.oauthButtonText}>Continue with Google</Text>
                    )}
                </TouchableOpacity>

                {errorMessage && (
                    <Text style={styles.error}>{errorMessage}</Text>
                )}
            </KeyboardAvoidingView>
        </InnerScreen>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 40,
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontFamily: 'PressStart2P',
        color: '#2d1b69',
        textAlign: 'center',
        marginBottom: 8,
        letterSpacing: 1,
    },
    subtitle: {
        fontSize: 12,
        fontFamily: 'PressStart2P',
        color: '#6b5b95',
        textAlign: 'center',
        marginBottom: 32,
    },
    emailBlock: {
        width: '100%',
        maxWidth: 320,
        gap: 12,
    },
    input: {
        borderWidth: 2,
        borderColor: '#2d1b69',
        backgroundColor: '#fefaff',
        borderRadius: 6,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        color: '#2d1b69',
        fontFamily: 'monospace',
    },
    primaryButton: {
        backgroundColor: '#8ee2d9',
        borderWidth: 2,
        borderColor: '#2d1b69',
        borderRadius: 6,
        paddingVertical: 14,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 0,
        elevation: 4,
    },
    primaryButtonText: {
        fontSize: 13,
        fontFamily: 'PressStart2P',
        color: '#2d1b69',
        letterSpacing: 1,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        maxWidth: 320,
        marginVertical: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#c7b8e0',
    },
    dividerText: {
        marginHorizontal: 12,
        fontSize: 11,
        fontFamily: 'PressStart2P',
        color: '#6b5b95',
    },
    oauthButton: {
        backgroundColor: '#e5dcf5',
        borderWidth: 2,
        borderColor: '#2d1b69',
        borderRadius: 6,
        paddingVertical: 14,
        paddingHorizontal: 24,
        width: '100%',
        maxWidth: 320,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 0,
        elevation: 4,
    },
    oauthButtonText: {
        fontSize: 12,
        fontFamily: 'PressStart2P',
        color: '#2d1b69',
        letterSpacing: 1,
    },
    error: {
        marginTop: 20,
        color: '#d14a6a',
        fontSize: 12,
        textAlign: 'center',
        fontFamily: 'monospace',
        paddingHorizontal: 16,
    },
});

export default LoginScreen;
