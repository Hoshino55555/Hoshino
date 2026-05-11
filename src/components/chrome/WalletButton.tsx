import React from 'react';
import { View, Text, TouchableOpacity, ImageBackground, StyleSheet } from 'react-native';
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

    return (
        <View style={styles.container}>
            <TouchableOpacity
                onPress={onOpenProfile}
                disabled={!onOpenProfile}
                testID="wallet-pill"
                activeOpacity={0.85}
            >
                <ImageBackground
                    source={Frames.username}
                    style={styles.connectedPill}
                    imageStyle={styles.connectedPillImage}
                    resizeMode="stretch"
                >
                    <Text style={styles.connectedText} numberOfLines={1}>{label}</Text>
                </ImageBackground>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 40,
        right: 20,
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
    connectedPill: {
        paddingTop: 7,
        paddingBottom: 9,
        paddingHorizontal: 14,
        maxWidth: 200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    connectedPillImage: {
        borderRadius: 0,
    },
    connectedText: {
        color: colors.forestDark,
        fontSize: 24,
        lineHeight: 17,
        fontFamily: fonts.body,
        textAlign: 'center',
        textAlignVertical: 'center',
        includeFontPadding: false,
    },
});

export default WalletButton;
