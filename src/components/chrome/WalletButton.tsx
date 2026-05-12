import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Frames } from '../../assets';
import { colors, fonts } from '../../styles/tokens';
import { Z } from '../../styles/zLayers';

interface WalletButtonProps {
    connected: boolean;
    publicKey?: string | null;
    playerName?: string;
    onConnect: () => void;
    onOpenProfile?: () => void;
}

const truncateAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

const WalletButton: React.FC<WalletButtonProps> = ({
    connected,
    publicKey,
    playerName,
    onConnect,
    onOpenProfile,
}) => {
    const hasWalletIdentity = connected || Boolean(publicKey);

    if (!hasWalletIdentity) {
        return (
            <View style={styles.container}>
                <TouchableOpacity style={styles.connectButton} onPress={onConnect}>
                    <Text style={styles.connectText}>Connect</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const trimmedName = playerName?.trim();
    const label = trimmedName && trimmedName.length > 0
        ? trimmedName
        : publicKey
            ? truncateAddress(publicKey)
            : 'Wallet';
    // 4 chars → 28pt, 9 chars → 18pt, linear in between, clamped at the ends.
    const labelFontSize = Math.max(18, Math.min(28, 28 - 2 * (label.length - 4)));

    return (
        <View style={styles.container}>
            <TouchableOpacity
                onPress={onOpenProfile}
                disabled={!onOpenProfile}
                testID="wallet-pill"
                activeOpacity={0.85}
            >
                <View style={styles.connectedPillWrap}>
                    <Image source={Frames.username} style={styles.connectedPillImage} resizeMode="contain" />
                    <Text style={[styles.connectedText, { fontSize: labelFontSize }]} numberOfLines={1}>{label}</Text>
                </View>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 20,
        right: -20,
        zIndex: Z.wallet,
        elevation: Z.wallet,
    },
    connectButton: {
        backgroundColor: colors.forestDark,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.mintPale,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    connectText: {
        color: colors.mintPale,
        fontSize: 13,
        fontFamily: fonts.body,
        transform: [{ translateY: 3 }],
    },
    connectedPillWrap: {
        width: 140,
        height: 75 * 198 / 324,
        alignItems: 'center',
        justifyContent: 'center',
    },
    connectedPillImage: {
        position: 'absolute',
        width: 75,
        height: 75 * 198 / 324,
    },
    connectedText: {
        color: colors.slotInk,
        fontSize: 28,
        lineHeight: 22,
        fontFamily: fonts.body,
        textAlign: 'center',
        textAlignVertical: 'center',
        includeFontPadding: false,
    },
});

export default WalletButton;
