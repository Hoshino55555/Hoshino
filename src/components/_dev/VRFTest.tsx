import React, { useMemo, useState } from 'react';
import { Buffer } from 'buffer';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Connection, PublicKey } from '@solana/web3.js';
import { useWallet } from '../../contexts/WalletContext';
import { VRF_RUNTIME_CONFIG } from '../../config/vrf';
import { MagicBlockVRFService, type VRFContext } from '../../services/VRFService';

interface Props {
    onClose: () => void;
}

const connection = new Connection(VRF_RUNTIME_CONFIG.rpcUrl, 'confirmed');

const VRFTest: React.FC<Props> = ({ onClose }) => {
    const { connected, publicKey, walletSource, signer, connect, disconnect } = useWallet();
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<string>('No VRF request yet.');
    const [error, setError] = useState<string | null>(null);

    const vrfService = useMemo(() => {
        if (!signer) {
            return null;
        }

        return new MagicBlockVRFService({
            connection,
            signer,
            programId: new PublicKey(VRF_RUNTIME_CONFIG.programId),
            oracleQueue: new PublicKey(VRF_RUNTIME_CONFIG.oracleQueue),
            vrfProgramId: new PublicKey(VRF_RUNTIME_CONFIG.vrfProgramId),
            timeoutMs: VRF_RUNTIME_CONFIG.fulfillmentTimeoutMs,
            pollIntervalMs: VRF_RUNTIME_CONFIG.pollIntervalMs,
            deployed: VRF_RUNTIME_CONFIG.deployed,
        });
    }, [signer]);

    const baseContext = useMemo<VRFContext | null>(() => {
        if (!publicKey) {
            return null;
        }

        return {
            purpose: 'gacha_onboarding',
            userPubkey: publicKey,
            nonce: `dev-${Date.now()}`,
        };
    }, [publicKey]);

    const runRequest = async (label: string, runner: () => Promise<string>) => {
        setIsLoading(true);
        setError(null);

        try {
            const nextResult = await runner();
            setResult(`${label}\n${nextResult}`);
        } catch (requestError) {
            const message =
                requestError instanceof Error
                    ? requestError.message
                    : 'Unknown VRF test error';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>VRF Test Harness</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Config</Text>
                    <Text style={styles.cardText}>Cluster: {VRF_RUNTIME_CONFIG.cluster}</Text>
                    <Text style={styles.cardText}>
                        Program: {VRF_RUNTIME_CONFIG.programId}
                    </Text>
                    <Text style={styles.cardText}>
                        Queue: {VRF_RUNTIME_CONFIG.oracleQueue}
                    </Text>
                    <Text style={styles.cardText}>
                        Deploy Flag: {VRF_RUNTIME_CONFIG.deployed ? 'live' : 'pending'}
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Wallet</Text>
                    <Text style={styles.cardText}>
                        {connected && publicKey ? publicKey : 'Disconnected'}
                    </Text>
                    {!connected ? (
                        <TouchableOpacity style={styles.actionButton} onPress={connect}>
                            <Text style={styles.actionButtonText}>Connect Wallet</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.secondaryButton} onPress={disconnect}>
                            <Text style={styles.secondaryButtonText}>Disconnect</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Actions</Text>
                    <TouchableOpacity
                        style={styles.actionButton}
                        disabled={!vrfService || !baseContext || isLoading}
                        onPress={() =>
                            runRequest('pickIndex(5)', async () => {
                                const context = {
                                    ...baseContext!,
                                    nonce: `pick-index-${Date.now()}`,
                                };
                                const value = await vrfService!.pickIndex(5, context);
                                return `Index: ${value}`;
                            })
                        }
                    >
                        <Text style={styles.actionButtonText}>Pick Index</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionButton}
                        disabled={!vrfService || !baseContext || isLoading}
                        onPress={() =>
                            runRequest('pickWeighted', async () => {
                                const context = {
                                    ...baseContext!,
                                    nonce: `pick-weighted-${Date.now()}`,
                                };
                                const value = await vrfService!.pickWeighted(
                                    {
                                        common: 70,
                                        rare: 25,
                                        epic: 5,
                                    },
                                    context
                                );
                                return `Tier: ${value}`;
                            })
                        }
                    >
                        <Text style={styles.actionButtonText}>Pick Weighted</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionButton}
                        disabled={!vrfService || !baseContext || isLoading}
                        onPress={() =>
                            runRequest('fetchSeed', async () => {
                                const context = {
                                    ...baseContext!,
                                    purpose: 'starburst_seed' as const,
                                    nonce: `seed-${Date.now()}`,
                                };
                                const seed = await vrfService!.fetchSeed(context);
                                return `Seed: ${Buffer.from(seed).toString('hex')}`;
                            })
                        }
                    >
                        <Text style={styles.actionButtonText}>Fetch Seed</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Result</Text>
                    {isLoading ? (
                        <ActivityIndicator color="#111827" />
                    ) : (
                        <Text style={styles.resultText}>{result}</Text>
                    )}
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f3f6e8',
        paddingTop: 64,
        paddingHorizontal: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    closeButton: {
        backgroundColor: '#111827',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    closeButtonText: {
        color: '#f9fafb',
        fontWeight: '700',
    },
    content: {
        paddingBottom: 32,
        gap: 12,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        gap: 10,
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    cardText: {
        color: '#374151',
        fontSize: 13,
    },
    actionButton: {
        backgroundColor: '#1f7a5a',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    actionButtonText: {
        color: '#f9fafb',
        fontWeight: '700',
        textAlign: 'center',
    },
    secondaryButton: {
        backgroundColor: '#e5e7eb',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    secondaryButtonText: {
        color: '#111827',
        fontWeight: '700',
        textAlign: 'center',
    },
    resultText: {
        color: '#111827',
        fontSize: 13,
    },
    errorText: {
        color: '#b91c1c',
        fontSize: 13,
        fontWeight: '600',
    },
});

export default VRFTest;
