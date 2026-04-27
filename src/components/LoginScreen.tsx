import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useLoginWithEmail, useLoginWithOAuth, useLoginWithSiws } from '@privy-io/expo';
import {
    useBackpackDeeplinkWalletConnector,
    usePhantomDeeplinkWalletConnector,
} from '@privy-io/expo/connectors';
import { mobileWalletService, useWallet } from '../contexts/WalletContext';
import type { ExternalWalletProvider } from '../contexts/WalletContext';
import { Logos } from '../assets';

const WALLET_APP_URL = 'https://hoshino.gg';
const WALLET_REDIRECT_PATH = '/wallet-auth';
const SIWS_DOMAIN = 'hoshino.gg';
const SIWS_URI = 'https://hoshino.gg';
const WALLET_AUTH_TIMEOUT_MS = 75000;
const ANDROID_PACKAGE_NAME = 'com.socks.hoshino';
type WalletLoginProvider = 'native' | ExternalWalletProvider;

function normalizeAuthError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (
        message.includes('Native app ID') ||
        message.includes('invalid_native_app_id')
    ) {
        return `Privy client must allow Android package ${ANDROID_PACKAGE_NAME}.`;
    }

    return message;
}

const LoginScreen: React.FC = () => {
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [walletOptionsOpen, setWalletOptionsOpen] = useState(false);
    const [pendingWalletProvider, setPendingWalletProvider] = useState<WalletLoginProvider | null>(null);
    const {
        connect: connectNativeWallet,
        publicKey: connectedWalletPublicKey,
        walletSource,
    } = useWallet();

    const {
        sendCode,
        loginWithCode,
        state: emailState,
    } = useLoginWithEmail({
        onError: (error) => {
            setErrorMessage(normalizeAuthError(error) || 'Email login failed');
        },
    });

    const { login: loginWithOAuth, state: oauthState } = useLoginWithOAuth({
        onError: (error) => {
            setErrorMessage(normalizeAuthError(error) || 'Google login failed');
        },
    });
    const { generateMessage: generateSiwsMessage, login: loginWithSiws } = useLoginWithSiws();
    const phantomConnector = usePhantomDeeplinkWalletConnector({
        appUrl: WALLET_APP_URL,
        redirectUri: WALLET_REDIRECT_PATH,
    });
    const backpackConnector = useBackpackDeeplinkWalletConnector({
        appUrl: WALLET_APP_URL,
        redirectUri: WALLET_REDIRECT_PATH,
    });

    const isSendingCode = emailState.status === 'sending-code';
    const isAwaitingCode = emailState.status === 'awaiting-code-input';
    const isSubmittingCode = emailState.status === 'submitting-code';
    const isOauthPending = oauthState.status === 'loading';
    const isCodeStep = isAwaitingCode || isSubmittingCode;
    const isWalletPending = pendingWalletProvider !== null;
    const anyPending = isSendingCode || isSubmittingCode || isOauthPending || isWalletPending;
    const pendingWalletAddress = pendingWalletProvider === 'native'
        ? walletSource === 'mwa'
            ? connectedWalletPublicKey ?? undefined
            : undefined
        : pendingWalletProvider === 'phantom'
        ? phantomConnector.address
        : pendingWalletProvider === 'backpack'
            ? backpackConnector.address
            : undefined;
    const isPendingWalletConnected = pendingWalletProvider === 'native'
        ? walletSource === 'mwa' && !!connectedWalletPublicKey
        : pendingWalletProvider === 'phantom'
        ? phantomConnector.isConnected
        : pendingWalletProvider === 'backpack'
            ? backpackConnector.isConnected
            : false;

    const statusLabel = useMemo(() => {
        if (pendingWalletProvider && !isPendingWalletConnected) return 'OPENING WALLET';
        if (pendingWalletProvider) return 'SIGN MESSAGE';
        if (isSubmittingCode) return 'VERIFYING';
        if (isAwaitingCode) return 'CODE SENT';
        if (isSendingCode) return 'SENDING';
        if (isOauthPending) return 'GOOGLE';
        return 'READY';
    }, [
        isAwaitingCode,
        isOauthPending,
        isPendingWalletConnected,
        isSendingCode,
        isSubmittingCode,
        pendingWalletProvider,
    ]);

    const helperText = useMemo(() => {
        if (pendingWalletProvider) {
            return 'Approve in wallet.';
        }

        if (isCodeStep) {
            return 'Check your email.';
        }

        return 'Choose a sign-in method.';
    }, [isCodeStep, pendingWalletProvider]);

    useEffect(() => {
        if (!pendingWalletProvider) {
            return;
        }

        const timeoutId = setTimeout(() => {
            setPendingWalletProvider(null);
            setErrorMessage('Wallet login timed out. Try again from the app after returning from your wallet.');
        }, WALLET_AUTH_TIMEOUT_MS);

        return () => clearTimeout(timeoutId);
    }, [pendingWalletProvider]);

    useEffect(() => {
        if (!pendingWalletProvider || !isPendingWalletConnected || !pendingWalletAddress) {
            return;
        }

        const activeConnector = pendingWalletProvider === 'phantom'
            ? phantomConnector
            : backpackConnector;
        let cancelled = false;

        const authenticateWithWallet = async () => {
            try {
                setErrorMessage(null);

                const { message } = await generateSiwsMessage({
                    wallet: { address: pendingWalletAddress },
                    from: {
                        domain: SIWS_DOMAIN,
                        uri: SIWS_URI,
                    },
                });

                if (cancelled) {
                    return;
                }

                const signature = pendingWalletProvider === 'native'
                    ? await mobileWalletService.signMessage(message)
                    : (await activeConnector.signMessage(message)).signature;

                if (cancelled) {
                    return;
                }

                await loginWithSiws({
                    message,
                    signature,
                    wallet: {
                        connectorType: pendingWalletProvider === 'native' ? 'mobile_wallet_adapter' : pendingWalletProvider,
                        walletClientType: pendingWalletProvider === 'native' ? 'mobile_wallet_adapter' : pendingWalletProvider,
                    },
                });
            } catch (error) {
                if (!cancelled) {
                    setErrorMessage(normalizeAuthError(error) || `${pendingWalletProvider} login failed`);
                }
            } finally {
                if (!cancelled) {
                    setPendingWalletProvider(null);
                }
            }
        };

        authenticateWithWallet();

        return () => {
            cancelled = true;
        };
    }, [
        generateSiwsMessage,
        isPendingWalletConnected,
        loginWithSiws,
        pendingWalletAddress,
        pendingWalletProvider,
    ]);

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

    const handleWalletLogin = async (provider: WalletLoginProvider) => {
        setErrorMessage(null);
        setPendingWalletProvider(provider);
        setWalletOptionsOpen(true);

        try {
            if (provider === 'native') {
                if (walletSource !== 'mwa' || !connectedWalletPublicKey) {
                    await connectNativeWallet();
                }
                return;
            }

            const connector = provider === 'phantom' ? phantomConnector : backpackConnector;
            if (!connector.isConnected || !connector.address) {
                await connector.connect();
            }
        } catch (error) {
            setPendingWalletProvider(null);
            setErrorMessage(normalizeAuthError(error) || 'Wallet connection failed');
        }
    };

    return (
        <LinearGradient
            colors={['#09161f', '#112735', '#21424e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fullScreen}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.container}
            >
                <View style={styles.backdropGlowLarge} pointerEvents="none" />
                <View style={styles.backdropGlowSmall} pointerEvents="none" />
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.panel}>
                        <View style={styles.panelInner}>
                            <View style={styles.heroBlock}>
                                <View style={styles.heroTopRow}>
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>HOSHINO</Text>
                                    </View>
                                    <View style={styles.statusBadge}>
                                        <View style={styles.statusDot} />
                                        <Text style={styles.statusBadgeText}>{statusLabel}</Text>
                                    </View>
                                </View>

                                <Image
                                    source={Logos.clean}
                                    style={styles.logo}
                                    resizeMode="contain"
                                />

                                <Text style={styles.title}>
                                    {isCodeStep ? 'Enter Code' : 'Sign In'}
                                </Text>
                                <Text style={styles.subtitle}>{helperText}</Text>
                            </View>

                            <View style={styles.formShell}>
                                {!isCodeStep ? (
                                    <>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Email"
                                            placeholderTextColor="#6f8d98"
                                            value={email}
                                            onChangeText={setEmail}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            editable={!anyPending}
                                            returnKeyType="send"
                                            onSubmitEditing={handleSendCode}
                                        />

                                        <TouchableOpacity
                                            style={[styles.primaryButton, anyPending && styles.buttonDisabled]}
                                            onPress={handleSendCode}
                                            disabled={anyPending}
                                            activeOpacity={0.86}
                                        >
                                            {isSendingCode ? (
                                                <ActivityIndicator color="#071019" />
                                            ) : (
                                                <Text style={styles.primaryButtonText}>Email</Text>
                                            )}
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <>
                                        <View style={styles.emailPreview}>
                                            <Text style={styles.emailPreviewLabel}>EMAIL</Text>
                                            <Text style={styles.emailPreviewValue}>{email.trim()}</Text>
                                        </View>

                                        <TextInput
                                            style={styles.input}
                                            placeholder="6-digit code"
                                            placeholderTextColor="#6f8d98"
                                            value={code}
                                            onChangeText={setCode}
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            editable={!isSubmittingCode}
                                            returnKeyType="done"
                                            onSubmitEditing={handleVerifyCode}
                                        />

                                        <TouchableOpacity
                                            style={[styles.primaryButton, isSubmittingCode && styles.buttonDisabled]}
                                            onPress={handleVerifyCode}
                                            disabled={isSubmittingCode}
                                            activeOpacity={0.86}
                                        >
                                            {isSubmittingCode ? (
                                                <ActivityIndicator color="#071019" />
                                            ) : (
                                                <Text style={styles.primaryButtonText}>Verify</Text>
                                            )}
                                        </TouchableOpacity>
                                    </>
                                )}

                                <View style={styles.divider}>
                                    <View style={styles.dividerLine} />
                                    <Text style={styles.dividerText}>OR</Text>
                                    <View style={styles.dividerLine} />
                                </View>

                                <TouchableOpacity
                                    style={[styles.secondaryButton, anyPending && styles.buttonDisabled]}
                                    onPress={handleGoogle}
                                    disabled={anyPending}
                                    activeOpacity={0.86}
                                >
                                    {isOauthPending ? (
                                        <ActivityIndicator color="#dceaf0" />
                                    ) : (
                                        <>
                                            <View style={styles.googleMark}>
                                                <Text style={styles.googleMarkText}>G</Text>
                                            </View>
                                            <Text style={styles.secondaryButtonText}>Google</Text>
                                        </>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.walletTriggerButton, isWalletPending && styles.walletTriggerButtonActive]}
                                    onPress={() => setWalletOptionsOpen(open => !open)}
                                    disabled={isWalletPending}
                                    activeOpacity={0.86}
                                >
                                    {isWalletPending ? (
                                        <ActivityIndicator color="#f1fbff" />
                                    ) : (
                                        <Text style={styles.secondaryButtonText}>Connect Wallet</Text>
                                    )}
                                </TouchableOpacity>

                                {walletOptionsOpen && (
                                    <View style={styles.walletMenu}>
                                        <TouchableOpacity
                                            style={[
                                                styles.walletButton,
                                                pendingWalletProvider === 'native' && styles.walletButtonActive,
                                                anyPending && pendingWalletProvider !== 'native' && styles.buttonDisabled,
                                            ]}
                                            onPress={() => handleWalletLogin('native')}
                                            disabled={anyPending}
                                            activeOpacity={0.86}
                                        >
                                            {pendingWalletProvider === 'native' ? (
                                                <ActivityIndicator color="#e9fbff" />
                                            ) : (
                                                <>
                                                    <Text style={styles.walletButtonEyebrow}>SEEKER</Text>
                                                    <Text style={styles.walletButtonText}>Native Wallet</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.walletButton,
                                                pendingWalletProvider === 'phantom' && styles.walletButtonActive,
                                                anyPending && pendingWalletProvider !== 'phantom' && styles.buttonDisabled,
                                            ]}
                                            onPress={() => handleWalletLogin('phantom')}
                                            disabled={anyPending}
                                            activeOpacity={0.86}
                                        >
                                            {pendingWalletProvider === 'phantom' ? (
                                                <ActivityIndicator color="#e9fbff" />
                                            ) : (
                                                <>
                                                    <Text style={styles.walletButtonEyebrow}>EXTERNAL</Text>
                                                    <Text style={styles.walletButtonText}>Phantom</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.walletButton,
                                                pendingWalletProvider === 'backpack' && styles.walletButtonActive,
                                                anyPending && pendingWalletProvider !== 'backpack' && styles.buttonDisabled,
                                            ]}
                                            onPress={() => handleWalletLogin('backpack')}
                                            disabled={anyPending}
                                            activeOpacity={0.86}
                                        >
                                            {pendingWalletProvider === 'backpack' ? (
                                                <ActivityIndicator color="#e9fbff" />
                                            ) : (
                                                <>
                                                    <Text style={styles.walletButtonEyebrow}>EXTERNAL</Text>
                                                    <Text style={styles.walletButtonText}>Backpack</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {errorMessage && (
                                    <View style={styles.errorBanner}>
                                        <Text style={styles.errorLabel}>AUTH ERROR</Text>
                                        <Text style={styles.errorText}>{errorMessage}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    fullScreen: {
        flex: 1,
    },
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 32,
    },
    backdropGlowLarge: {
        position: 'absolute',
        width: 360,
        height: 360,
        borderRadius: 180,
        backgroundColor: 'rgba(91, 196, 255, 0.16)',
        top: 60,
        right: -80,
    },
    backdropGlowSmall: {
        position: 'absolute',
        width: 260,
        height: 260,
        borderRadius: 130,
        backgroundColor: 'rgba(255, 210, 124, 0.14)',
        bottom: 60,
        left: -80,
    },
    panel: {
        width: '100%',
        maxWidth: 480,
        alignSelf: 'center',
    },
    panelInner: {
        paddingHorizontal: 4,
        paddingTop: 8,
        paddingBottom: 16,
    },
    ringLarge: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        borderWidth: 1,
        borderColor: 'rgba(173, 227, 255, 0.20)',
        top: -72,
        right: -56,
    },
    ringSmall: {
        position: 'absolute',
        width: 128,
        height: 128,
        borderRadius: 64,
        borderWidth: 1,
        borderColor: 'rgba(255, 215, 133, 0.22)',
        bottom: 116,
        left: -44,
    },
    heroBlock: {
        gap: 16,
        paddingBottom: 24,
        alignItems: 'center',
    },
    heroTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        width: '100%',
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(201, 236, 248, 0.55)',
        backgroundColor: 'rgba(10, 24, 36, 0.55)',
    },
    badgeText: {
        fontFamily: 'PressStart2P',
        fontSize: 8,
        color: '#e2f8ff',
        letterSpacing: 1,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: 'rgba(255, 246, 209, 0.14)',
        borderWidth: 1,
        borderColor: 'rgba(255, 228, 155, 0.30)',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#8be2ff',
    },
    statusBadgeText: {
        fontFamily: 'PressStart2P',
        fontSize: 7,
        color: '#fff0bf',
        letterSpacing: 0.8,
    },
    logo: {
        width: 200,
        height: 66,
        marginTop: 8,
    },
    title: {
        fontFamily: 'PressStart2P',
        fontSize: 22,
        lineHeight: 32,
        color: '#f7fdff',
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: 'monospace',
        fontSize: 14,
        lineHeight: 20,
        color: '#bdd7e0',
        textAlign: 'center',
    },
    formShell: {
        gap: 14,
        padding: 18,
        borderRadius: 24,
        backgroundColor: 'rgba(240, 249, 255, 0.96)',
        borderWidth: 2,
        borderColor: '#164257',
    },
    input: {
        borderWidth: 2,
        borderColor: '#1c556c',
        backgroundColor: '#ffffff',
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'ios' ? 14 : 12,
        fontSize: 15,
        color: '#103142',
        fontFamily: 'monospace',
    },
    emailPreview: {
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: '#dff4fb',
        borderWidth: 1,
        borderColor: '#8cbfd2',
        gap: 4,
    },
    emailPreviewLabel: {
        fontFamily: 'PressStart2P',
        fontSize: 7,
        color: '#4c7e90',
    },
    emailPreviewValue: {
        fontFamily: 'monospace',
        fontSize: 14,
        color: '#14394b',
        fontWeight: '600',
    },
    primaryButton: {
        minHeight: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#8be2ff',
        borderWidth: 2,
        borderColor: '#103142',
        shadowColor: '#103142',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.22,
        shadowRadius: 0,
        elevation: 5,
    },
    primaryButtonText: {
        fontFamily: 'PressStart2P',
        fontSize: 11,
        color: '#071019',
        letterSpacing: 0.6,
        textAlign: 'center',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 2,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#9ab7c3',
    },
    dividerText: {
        fontFamily: 'PressStart2P',
        fontSize: 7,
        color: '#648797',
    },
    secondaryButton: {
        minHeight: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 12,
        backgroundColor: '#163141',
        borderWidth: 2,
        borderColor: '#d2edf7',
        paddingHorizontal: 14,
    },
    googleMark: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    googleMarkText: {
        fontFamily: 'PressStart2P',
        fontSize: 10,
        color: '#13384b',
    },
    secondaryButtonText: {
        fontFamily: 'PressStart2P',
        fontSize: 10,
        color: '#f1fbff',
        letterSpacing: 0.6,
        textAlign: 'center',
    },
    walletTriggerButton: {
        minHeight: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#102836',
        borderWidth: 2,
        borderColor: '#6db6d2',
        paddingHorizontal: 14,
    },
    walletTriggerButtonActive: {
        backgroundColor: '#17384a',
        borderColor: '#d2edf7',
    },
    walletMenu: {
        gap: 10,
    },
    walletButton: {
        minHeight: 62,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 12,
        justifyContent: 'center',
        alignItems: 'flex-start',
        backgroundColor: '#18394b',
        borderWidth: 1,
        borderColor: '#75b8d3',
    },
    walletButtonActive: {
        backgroundColor: '#21526b',
        borderColor: '#d7f6ff',
    },
    walletButtonEyebrow: {
        fontFamily: 'PressStart2P',
        fontSize: 6,
        color: '#8be2ff',
        marginBottom: 8,
    },
    walletButtonText: {
        fontFamily: 'PressStart2P',
        fontSize: 9,
        color: '#f5fdff',
    },
    buttonDisabled: {
        opacity: 0.62,
    },
    errorBanner: {
        marginTop: 4,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: '#ffe0dc',
        borderWidth: 1,
        borderColor: '#cf6d64',
        gap: 4,
    },
    errorLabel: {
        fontFamily: 'PressStart2P',
        fontSize: 7,
        color: '#9d3e36',
    },
    errorText: {
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 18,
        color: '#7b2e27',
    },
});

export default LoginScreen;
