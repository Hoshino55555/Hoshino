import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useMemo } from 'react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { usePrivy, useEmbeddedSolanaWallet } from '@privy-io/expo';
import {
    useBackpackDeeplinkWalletConnector,
    usePhantomDeeplinkWalletConnector,
} from '@privy-io/expo/connectors';
import { MobileWalletService } from '../services/MobileWalletService';
import type { VRFSigner } from '../services/VRFService';

export const mobileWalletService = new MobileWalletService();

const WALLET_APP_URL = 'https://hoshino.gg';
const WALLET_REDIRECT_PATH = '/wallet-auth';

export type ExternalWalletProvider = 'phantom' | 'backpack';
export type WalletSource = 'mwa' | ExternalWalletProvider | 'embedded' | null;

interface WalletContextType {
    connected: boolean;
    publicKey: string | null;
    walletSource: WalletSource;
    signer: VRFSigner | null;
    email: string | null;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

interface WalletProviderProps {
    children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
    const [mwaConnected, setMwaConnected] = useState(false);
    const [mwaPublicKey, setMwaPublicKey] = useState<string | null>(null);

    const { user, logout } = usePrivy();
    const embeddedSolanaWallet = useEmbeddedSolanaWallet();
    const phantomConnector = usePhantomDeeplinkWalletConnector({
        appUrl: WALLET_APP_URL,
        redirectUri: WALLET_REDIRECT_PATH,
    });
    const backpackConnector = useBackpackDeeplinkWalletConnector({
        appUrl: WALLET_APP_URL,
        redirectUri: WALLET_REDIRECT_PATH,
    });
    const linkedSolanaAddress = useMemo(() => {
        const linkedSolanaAccount = user?.linked_accounts.find(
            (account: any) =>
                account?.type === 'wallet' && account?.chain_type === 'solana'
        ) as { address?: string } | undefined;

        return linkedSolanaAccount?.address ?? null;
    }, [user]);

    const email = useMemo(() => {
        const accounts = user?.linked_accounts ?? [];
        const emailAccount = accounts.find(
            (account: any) => account?.type === 'email' && typeof account?.address === 'string'
        ) as { address?: string } | undefined;
        if (emailAccount?.address) return emailAccount.address;

        const googleAccount = accounts.find(
            (account: any) => account?.type === 'google_oauth' && typeof account?.email === 'string'
        ) as { email?: string } | undefined;
        return googleAccount?.email ?? null;
    }, [user]);

    // Safety net: if the user logged in before embedded-wallet auto-creation
    // was enabled, provision one now so they get a canonical solana identity.
    useEffect(() => {
        if (!user) return;
        if (linkedSolanaAddress) return;
        if (embeddedSolanaWallet.status !== 'not-created') return;
        if (!embeddedSolanaWallet.create) return;
        embeddedSolanaWallet.create().catch((err) => {
            console.warn('Privy embedded wallet create failed:', err);
        });
    }, [user, linkedSolanaAddress, embeddedSolanaWallet]);
    const externalWalletSource: ExternalWalletProvider | null = phantomConnector.isConnected && phantomConnector.address
        ? 'phantom'
        : backpackConnector.isConnected && backpackConnector.address
            ? 'backpack'
            : null;
    const externalWalletAddress =
        externalWalletSource === 'phantom'
            ? phantomConnector.address ?? null
            : externalWalletSource === 'backpack'
                ? backpackConnector.address ?? null
                : null;

    useEffect(() => {
        const initializeWallet = async () => {
            try {
                const adapter = await mobileWalletService.initialize();

                adapter.on('connect', (publicKey: PublicKey) => {
                    console.log('📱 Mobile wallet connected:', publicKey.toString());
                    setMwaConnected(true);
                    setMwaPublicKey(publicKey.toString());
                });

                adapter.on('disconnect', () => {
                    console.log('📱 Mobile wallet disconnected');
                    setMwaConnected(false);
                    setMwaPublicKey(null);
                });

                adapter.on('error', (error: Error) => {
                    console.error('📱 Mobile wallet error:', error);
                });

                if (adapter.connected && adapter.publicKey) {
                    setMwaConnected(true);
                    setMwaPublicKey(adapter.publicKey.toString());
                }
            } catch (error) {
                console.error('📱 Failed to initialize mobile wallet service:', error);
            }
        };

        initializeWallet();
    }, []);

    const walletSource: WalletSource = mwaConnected
        ? 'mwa'
        : externalWalletSource
            ? externalWalletSource
            : linkedSolanaAddress
                ? 'embedded'
                : null;

    const publicKey = mwaConnected
        ? mwaPublicKey
        : externalWalletAddress ?? linkedSolanaAddress;

    const connected = walletSource !== null;

    const connect = useCallback(async () => {
        try {
            console.log('📱 Attempting to connect mobile wallet...');
            const publicKey = await mobileWalletService.connect();
            if (publicKey) {
                setMwaConnected(true);
                setMwaPublicKey(publicKey.toString());
            }
        } catch (error) {
            console.error('📱 Failed to connect mobile wallet:', error);
            alert('Failed to connect wallet. Please make sure you have Solflare or another mobile wallet installed.');
        }
    }, []);

    const disconnect = useCallback(async () => {
        try {
            if (walletSource === 'mwa') {
                await mobileWalletService.disconnect();
            } else if (walletSource === 'phantom') {
                await phantomConnector.disconnect();
            } else if (walletSource === 'backpack') {
                await backpackConnector.disconnect();
            }
        } catch (error) {
            console.error('📱 Failed to disconnect wallet:', error);
        } finally {
            if (walletSource === 'mwa') {
                setMwaConnected(false);
                setMwaPublicKey(null);
            }

            if (user) {
                try {
                    await logout();
                } catch (error) {
                    console.error('📱 Failed to log out Privy session:', error);
                }
            }
        }
    }, [backpackConnector, logout, phantomConnector, user, walletSource]);

    const signer = useMemo<VRFSigner | null>(() => {
        if (walletSource === 'mwa' && mwaPublicKey) {
            const signerPublicKey = new PublicKey(mwaPublicKey);
            return {
                publicKey: signerPublicKey,
                signAndSend: async (tx: Transaction) => {
                    const response = await mobileWalletService.signAndSendSolanaTransaction(tx);
                    return response.signature;
                },
            };
        }

        if (
            walletSource === 'phantom' &&
            phantomConnector.address &&
            phantomConnector.isConnected
        ) {
            const signerPublicKey = new PublicKey(phantomConnector.address);
            return {
                publicKey: signerPublicKey,
                signAndSend: async (tx: Transaction) => {
                    const response = await phantomConnector.signAndSendTransaction(tx);
                    return response.signature;
                },
            };
        }

        if (
            walletSource === 'backpack' &&
            backpackConnector.address &&
            backpackConnector.isConnected
        ) {
            const signerPublicKey = new PublicKey(backpackConnector.address);
            return {
                publicKey: signerPublicKey,
                signAndSend: async (tx: Transaction) => {
                    const response = await backpackConnector.signAndSendTransaction(tx);
                    return response.signature;
                },
            };
        }

        if (walletSource === 'embedded' && linkedSolanaAddress) {
            const signerPublicKey = new PublicKey(linkedSolanaAddress);
            return {
                publicKey: signerPublicKey,
                signAndSend: async (tx: Transaction) => {
                    if (embeddedSolanaWallet.status !== 'connected') {
                        throw new Error('Embedded Solana wallet not ready to sign');
                    }
                    const wallet = embeddedSolanaWallet.wallets[0];
                    if (!wallet) {
                        throw new Error('No embedded Solana wallet available');
                    }
                    const provider = await wallet.getProvider();
                    // Caller populates tx.recentBlockhash / feePayer; VRFService
                    // owns its Connection. Keep this branch thin.
                    const connection = new Connection(
                        process.env.EXPO_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
                    );
                    const { signature } = await provider.request({
                        method: 'signAndSendTransaction',
                        params: { transaction: tx, connection },
                    });
                    return signature;
                },
            };
        }

        return null;
    }, [
        walletSource,
        mwaPublicKey,
        phantomConnector,
        backpackConnector,
        embeddedSolanaWallet,
        linkedSolanaAddress,
    ]);

    return (
        <WalletContext.Provider value={{
            connected,
            publicKey,
            walletSource,
            signer,
            email,
            connect,
            disconnect,
        }}>
            {children}
        </WalletContext.Provider>
    );
};

export const useWallet = () => {
    const context = useContext(WalletContext);
    if (context === undefined) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
};
