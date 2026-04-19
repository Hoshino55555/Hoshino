import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useMemo } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { usePrivy } from '@privy-io/expo';
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
export type WalletSource = 'mwa' | ExternalWalletProvider | null;

interface WalletContextType {
    connected: boolean;
    publicKey: string | null;
    walletSource: WalletSource;
    signer: VRFSigner | null;
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

        return null;
    }, [
        walletSource,
        mwaPublicKey,
        phantomConnector,
        backpackConnector,
    ]);

    return (
        <WalletContext.Provider value={{
            connected,
            publicKey,
            walletSource,
            signer,
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
