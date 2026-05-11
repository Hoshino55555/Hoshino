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
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { mobileWalletService, useWallet } from '../../contexts/WalletContext';
import type { ExternalWalletProvider } from '../../contexts/WalletContext';
import { Logos } from '../../assets';
import { colors, fonts } from '../../styles/tokens';

const WALLET_APP_URL = 'https://hoshino.gg';
// Phantom/Backpack deeplinks return here after connect/sign. Must be a full
// URI with a scheme registered in AndroidManifest (`hoshino://`), not a path.
// Privy's connector rejects a bare path as invalid → user sees an auth error.
const WALLET_REDIRECT_PATH = 'hoshino://wallet-auth';
const SIWS_DOMAIN = 'hoshino.gg';
const SIWS_URI = 'https://hoshino.gg';
const WALLET_AUTH_TIMEOUT_MS = 75000;
const ANDROID_PACKAGE_NAME = 'com.socks.hoshino';
type WalletLoginProvider = 'native' | ExternalWalletProvider;

// Single-screen "underwater terminal" palette. Stays local because these
// only make sense as a coordinated set for this login screen — exposing
// names like "panel"/"slateInk" on the global token would invite cross-use.
// Near-identical drift collapsed here (slateMid covers #13384b/#14394b,
// panelHover covers #17384a/#18394b, iceText covers #f1fbff/#f5fdff/#f7fdff).
const PALETTE = {
    // Backdrop gradient (deep → shallow)
    deep: '#09161f',
    mid: '#112735',
    shallow: '#21424e',

    abyss: '#071019',              // shadow / darkest spinner

    // Panel fills (dark blue layers)
    panel: '#163141',              // primary button bg
    panelDeep: '#102836',          // wallet trigger bg
    panelHover: '#17384a',         // wallet trigger pressed (collapses #18394b drift)
    panelActive: '#21526b',        // wallet menu selected

    // Panel strokes
    panelStroke: '#164257',
    panelStrokeActive: '#1c556c',

    // Slate text + button shadow on light surfaces
    slateInk: '#103142',
    slateMid: '#13384b',           // (collapses #14394b drift)

    // Aqua mids (placeholders, inactive borders)
    aquaPlaceholder: '#6f8d98',
    aquaMid: '#648797',
    aquaMute: '#4c7e90',
    aquaBorder: '#6db6d2',
    aquaBorderActive: '#75b8d3',
    aquaBorderSoft: '#8cbfd2',
    aquaInactive: '#9ab7c3',

    // Cyan accents
    cyanCta: '#8be2ff',
    cyanSpinner: '#e9fbff',

    // Ice text + light borders
    iceText: '#f7fdff',            // (collapses #f1fbff/#f5fdff drift)
    iceSubtle: '#bdd7e0',
    iceMuted: '#dff4fb',
    iceBorderLight: '#d2edf7',
    iceTextHi: '#d7f6ff',
    iceSpinner: '#dceaf0',

    // Error/warning rust
    rustBg: '#ffe0dc',
    rustBorder: '#cf6d64',
    rustLabel: '#9d3e36',
    rustText: '#7b2e27',
} as const;

function normalizeAuthError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (
        message.includes('Native app ID') ||
        message.includes('invalid_native_app_id')
    ) {
        return `Privy client must allow Android package ${ANDROID_PACKAGE_NAME}.`;
    }

    // User rejection patterns from MWA / Phantom / Backpack. Cancellation
    // isn't an error to apologise for — just acknowledge it so the user can
    // pick another method.
    const lower = message.toLowerCase();
    if (
        lower.includes('user declined') ||
        lower.includes('user rejected') ||
        lower.includes('user cancel') ||
        lower.includes('cancelled') ||
        lower.includes('canceled') ||
        lower.includes('authorization_failed')
    ) {
        return 'Wallet connection cancelled.';
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

                // MWA returns the signature already base64-encoded. Phantom
                // and Backpack deeplinks return base58 per their protocol —
                // Privy's SIWS endpoint expects base64, so re-encode here or
                // the server replies "Invalid SIWS message and/or nonce".
                let signature: string;
                if (pendingWalletProvider === 'native') {
                    signature = await mobileWalletService.signMessage(message);
                } else {
                    const { signature: rawSignature } = await activeConnector.signMessage(message);
                    signature = Buffer.from(bs58.decode(rawSignature)).toString('base64');
                }

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
            colors={[PALETTE.deep, PALETTE.mid, PALETTE.shallow]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fullScreen}
            testID="login-screen"
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
                                            placeholderTextColor={PALETTE.aquaPlaceholder}
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
                                                <ActivityIndicator color={PALETTE.abyss} />
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
                                            placeholderTextColor={PALETTE.aquaPlaceholder}
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
                                                <ActivityIndicator color={PALETTE.abyss} />
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
                                        <ActivityIndicator color={PALETTE.iceSpinner} />
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
                                        <ActivityIndicator color={PALETTE.iceText} />
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
                                                <ActivityIndicator color={PALETTE.cyanSpinner} />
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
                                                <ActivityIndicator color={PALETTE.cyanSpinner} />
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
                                                <ActivityIndicator color={PALETTE.cyanSpinner} />
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
    logo: {
        width: 200,
        height: 66,
        marginTop: 8,
    },
    title: {
        fontFamily: fonts.body,
        fontSize: 47,
        lineHeight: 32,
        color: PALETTE.iceText,
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: fonts.body,
        fontSize: 30,
        lineHeight: 20,
        color: PALETTE.iceSubtle,
        textAlign: 'center',
    },
    formShell: {
        gap: 14,
        padding: 18,
        borderRadius: 16,
        backgroundColor: 'rgba(240, 249, 255, 0.96)',
        borderWidth: 2,
        borderColor: PALETTE.panelStroke,
    },
    input: {
        borderWidth: 2,
        borderColor: PALETTE.panelStrokeActive,
        backgroundColor: colors.white,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'ios' ? 14 : 12,
        fontSize: 24,
        color: PALETTE.slateInk,
        fontFamily: fonts.body,
    },
    emailPreview: {
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: PALETTE.iceMuted,
        borderWidth: 1,
        borderColor: PALETTE.aquaBorderSoft,
        gap: 4,
    },
    emailPreviewLabel: {
        fontFamily: fonts.body,
        fontSize: 15,
        color: PALETTE.aquaMute,
    },
    emailPreviewValue: {
        fontFamily: fonts.body,
        fontSize: 21,
        color: PALETTE.slateMid,
    },
    primaryButton: {
        minHeight: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: PALETTE.cyanCta,
        borderWidth: 2,
        borderColor: PALETTE.slateInk,
        shadowColor: PALETTE.slateInk,
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.22,
        shadowRadius: 0,
        elevation: 5,
    },
    primaryButtonText: {
        fontFamily: fonts.body,
        fontSize: 24,
        color: PALETTE.abyss,
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
        backgroundColor: PALETTE.aquaInactive,
    },
    dividerText: {
        fontFamily: fonts.body,
        fontSize: 15,
        color: PALETTE.aquaMid,
    },
    secondaryButton: {
        minHeight: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 12,
        backgroundColor: PALETTE.panel,
        borderWidth: 2,
        borderColor: PALETTE.iceBorderLight,
        paddingHorizontal: 14,
    },
    googleMark: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
    },
    googleMarkText: {
        fontFamily: fonts.body,
        fontSize: 21,
        color: PALETTE.slateMid,
    },
    secondaryButtonText: {
        fontFamily: fonts.body,
        fontSize: 21,
        color: PALETTE.iceText,
        letterSpacing: 0.6,
        textAlign: 'center',
    },
    walletTriggerButton: {
        minHeight: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: PALETTE.panelDeep,
        borderWidth: 2,
        borderColor: PALETTE.aquaBorder,
        paddingHorizontal: 14,
    },
    walletTriggerButtonActive: {
        backgroundColor: PALETTE.panelHover,
        borderColor: PALETTE.iceBorderLight,
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
        backgroundColor: PALETTE.panelHover,
        borderWidth: 1,
        borderColor: PALETTE.aquaBorderActive,
    },
    walletButtonActive: {
        backgroundColor: PALETTE.panelActive,
        borderColor: PALETTE.iceTextHi,
    },
    walletButtonEyebrow: {
        fontFamily: fonts.body,
        fontSize: 12,
        color: PALETTE.cyanCta,
        marginBottom: 8,
    },
    walletButtonText: {
        fontFamily: fonts.body,
        fontSize: 20,
        color: PALETTE.iceText,
    },
    buttonDisabled: {
        opacity: 0.62,
    },
    errorBanner: {
        marginTop: 4,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: PALETTE.rustBg,
        borderWidth: 1,
        borderColor: PALETTE.rustBorder,
        gap: 4,
    },
    errorLabel: {
        fontFamily: fonts.body,
        fontSize: 15,
        color: PALETTE.rustLabel,
    },
    errorText: {
        fontFamily: fonts.body,
        fontSize: 24,
        lineHeight: 18,
        color: PALETTE.rustText,
    },
});

export default LoginScreen;
