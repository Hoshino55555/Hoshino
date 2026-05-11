import React from 'react';
import { View, Text, TouchableOpacity, ImageBackground, StyleSheet } from 'react-native';
import { Frames } from '../../assets';
import { colors } from '../../styles/tokens';

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
        zIndex: 90,
    },
    connectButton: {
        backgroundColor: colors.forestDark,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.mintPale,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    connectText: {
        color: colors.mintPale,
        fontSize: 13,
        fontFamily: 'Monaco',
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
        fontFamily: 'Monaco',
        textAlign: 'center',
        textAlignVertical: 'center',
        includeFontPadding: false,
    },
});

export default WalletButton;
