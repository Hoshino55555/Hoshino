import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useProgrammableNFT } from '../hooks/useProgrammableNFT';

/**
 * Simple example component showing how to use Programmable NFT integration
 * This demonstrates the main functions you can use in your game
 */
export const SeekerNFTExample: React.FC = () => {
    const {
        // Connection status
        connected,
        connecting,
        
        // NFT minting functions
        quickMintCharacter,
        quickMintAchievement,
        
        // Utility functions
        connectWallet,
        disconnect,
        getServiceStatus
    } = useProgrammableNFT();

    const status = getServiceStatus();

    const handleMintCharacter = async () => {
        const exampleCharacter = {
            id: 'lyra',
            name: 'Lyra',
            element: 'Celestial',
            rarity: 'Common' as const,
            image: 'LYRA.gif',
            description: 'A celestial character with starlight powers'
        };

        try {
            const result = await quickMintCharacter(exampleCharacter);
            console.log('✅ Character pNFT minted:', result);
        } catch (error) {
            console.error('❌ Minting failed:', error);
        }
    };

    const handleMintAchievement = async () => {
        const exampleAchievement = {
            id: 'first_moonoko',
            name: 'First Moonoko Befriended',
            description: 'You befriended your first moonoko!',
            rarity: 'Common' as const
        };

        try {
            const result = await quickMintAchievement(exampleAchievement);
            console.log('✅ Achievement pNFT minted:', result);
        } catch (error) {
            console.error('❌ Achievement minting failed:', error);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>🚀 Programmable NFT System</Text>
            
            {/* Connection Status */}
            <View style={styles.statusContainer}>
                <Text style={styles.statusText}>
                    {connected ? '✅ Wallet Connected' : '❌ Wallet Disconnected'}
                </Text>
                {status.available && 'standard' in status && (
                    <>
                        <Text style={styles.statusText}>Standard: {status.standard}</Text>
                        <Text style={styles.statusText}>Type: {status.tokenStandard}</Text>
                    </>
                )}
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
                {!connected ? (
                    <TouchableOpacity 
                        style={styles.connectButton} 
                        onPress={connectWallet}
                        disabled={connecting}
                    >
                        <Text style={styles.buttonText}>
                            {connecting ? 'Connecting...' : 'Connect Wallet'}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <>
                        <TouchableOpacity style={styles.mintButton} onPress={handleMintCharacter}>
                            <Text style={styles.buttonText}>Mint Character pNFT</Text>
                            <Text style={styles.costText}>~0.01 SOL (with update authority)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.achievementButton} onPress={handleMintAchievement}>
                            <Text style={styles.buttonText}>Mint Achievement pNFT</Text>
                            <Text style={styles.costText}>~0.008 SOL</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.disconnectButton} onPress={disconnect}>
                            <Text style={styles.buttonText}>Disconnect</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

            {/* Features */}
            <View style={styles.featuresContainer}>
                <Text style={styles.featuresTitle}>✨ Features:</Text>
                <Text style={styles.featureText}>• Token Metadata v1 standard</Text>
                <Text style={styles.featureText}>• Programmable NFTs (pNFTs)</Text>
                <Text style={styles.featureText}>• Update authority enabled</Text>
                <Text style={styles.featureText}>• IPFS metadata storage</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1a1a2e',
        borderRadius: 12,
        padding: 20,
        margin: 15,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 20,
    },
    statusContainer: {
        backgroundColor: '#16213e',
        borderRadius: 8,
        padding: 12,
        marginBottom: 20,
    },
    statusText: {
        color: '#fff',
        fontSize: 14,
        textAlign: 'center',
    },
    buttonContainer: {
        gap: 12,
        marginBottom: 20,
    },
    connectButton: {
        backgroundColor: '#4CAF50',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    mintButton: {
        backgroundColor: '#2196F3',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    achievementButton: {
        backgroundColor: '#FF9800',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    disconnectButton: {
        backgroundColor: '#f44336',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    costText: {
        color: '#ccc',
        fontSize: 12,
        marginTop: 4,
    },
    featuresContainer: {
        backgroundColor: '#0f3460',
        borderRadius: 8,
        padding: 12,
    },
    featuresTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    featureText: {
        color: '#ccc',
        fontSize: 14,
        marginBottom: 4,
    },
}); 