import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

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
                style={styles.connectedPill}
                onPress={onOpenProfile}
                disabled={!onOpenProfile}
            >
                <Text style={styles.connectedText} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 40,
        right: 20,
        zIndex: 1000,
    },
    connectButton: {
        backgroundColor: '#2E5A3E',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E8F5E8',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    connectText: {
        color: '#E8F5E8',
        fontSize: 10,
        fontWeight: '600',
        fontFamily: 'PressStart2P',
        transform: [{ translateY: 3 }],
    },
    connectedPill: {
        backgroundColor: 'rgba(232, 245, 232, 0.65)',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(46, 90, 62, 0.4)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 3,
        maxWidth: 160,
    },
    connectedText: {
        color: '#2E5A3E',
        fontSize: 10,
        fontWeight: '600',
        fontFamily: 'PressStart2P',
        transform: [{ translateY: 3 }],
    },
});

export default WalletButton;
