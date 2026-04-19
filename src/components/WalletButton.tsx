import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface WalletButtonProps {
    connected: boolean;
    publicKey?: string | null;
    onConnect: () => void;
    onDisconnect: () => void;
}

const WalletButton: React.FC<WalletButtonProps> = ({
    connected,
    publicKey,
    onConnect,
    onDisconnect
}) => {
    const hasWalletIdentity = connected || Boolean(publicKey);

    const getWalletDisplay = () => {
        if (!hasWalletIdentity || !publicKey) {
            return 'Connect';
        }
        // Display the base58 address properly
        return `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
    };

    return (
        <View style={styles.container}>
            {hasWalletIdentity ? (
                <TouchableOpacity 
                    style={styles.connectedButton}
                    onPress={onDisconnect}
                >
                    <Text style={styles.connectedText}>{getWalletDisplay()}</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity 
                    style={styles.connectButton}
                    onPress={onConnect}
                >
                    <Text style={styles.connectText}>Connect</Text>
                </TouchableOpacity>
            )}
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
    connectedButton: {
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
