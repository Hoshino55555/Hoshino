import {
  transact,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { Transaction, PublicKey} from '@solana/web3.js';

// App identity for wallet authorization
const APP_IDENTITY = {
  name: 'Hoshino',
  uri: 'https://hoshino.gg',
  icon: '/icon.png',
};



// React Native compatible event emitter
class EventEmitter {
    private listeners: { [key: string]: Function[] } = {};

    on(event: string, callback: Function) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    emit(event: string, data?: any) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    removeAllListeners() {
        this.listeners = {};
    }
}

export class MobileWalletService {
    private connected: boolean = false;
    private publicKey: PublicKey | null = null;
    private eventEmitter: EventEmitter;
    private authToken: string | null = null;
    private accountAddressBase64: string | null = null;

    constructor() {
        this.eventEmitter = new EventEmitter();
    }

    private updateAuthorizedAccount(account: { address: string }) {
        this.accountAddressBase64 = account.address;

        const decoded = Buffer.from(account.address, 'base64');
        const base58Address = bs58.encode(decoded);

        this.publicKey = new PublicKey(base58Address);
        this.connected = true;
    }

    async initialize(): Promise<any> {
        try {
            console.log('📱 Initializing React Native compatible wallet service...');
            
            return {
                connected: this.connected,
                publicKey: this.publicKey,
                on: (event: string, callback: Function) => {
                    this.eventEmitter.on(event, callback);
                },
                removeAllListeners: () => {
                    this.eventEmitter.removeAllListeners();
                }
            };
        } catch (error) {
            console.error('📱 Failed to initialize wallet service:', error);
            throw error;
        }
    }

    async connect(): Promise<PublicKey | null> {
        try {
            console.log('📱 Attempting to connect mobile wallet...');
            
            const authorizationResult = await transact(async (wallet) => {
                const authorizationResult = await wallet.authorize({
                    chain: 'solana:devnet',
                    identity: APP_IDENTITY,
                });

                this.authToken = authorizationResult.auth_token;
                const account = authorizationResult.accounts[0];
                this.updateAuthorizedAccount(account);

                this.eventEmitter.emit('connect', this.publicKey);
                console.log('📱 Wallet connected:', this.publicKey.toString());
                
                return this.publicKey;
            });

            return authorizationResult;
        } catch (error) {
            console.error('📱 Failed to connect mobile wallet:', error);
            this.eventEmitter.emit('error', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        try {
            console.log('📱 Disconnecting mobile wallet...');
            
            if (this.authToken) {
                await transact(async (wallet) => {
                    await wallet.deauthorize({ auth_token: this.authToken! });
                });
            }
            
            this.connected = false;
            this.publicKey = null;
            this.authToken = null;
            this.accountAddressBase64 = null;
            
            this.eventEmitter.emit('disconnect');
        } catch (error) {
            console.error('📱 Failed to disconnect mobile wallet:', error);
            this.connected = false;
            this.publicKey = null;
            this.authToken = null;
            this.accountAddressBase64 = null;
            this.eventEmitter.emit('disconnect');
        }
    }

    /**
     * Sign an arbitrary message using the mobile wallet adapter.
     * Returns a base64 signature suitable for SIWS/SIWE-style auth flows.
     */
    async signMessage(message: string | Uint8Array): Promise<string> {
        console.log('📱 Signing message with mobile wallet...');

        if (!this.connected || !this.publicKey || !this.authToken || !this.accountAddressBase64) {
            throw new Error('Wallet not connected');
        }

        const messageBytes = typeof message === 'string' ? Buffer.from(message, 'utf8') : message;

        try {
            return await transact(async (wallet) => {
                const authorizationResult = await wallet.reauthorize({
                    auth_token: this.authToken!,
                    identity: APP_IDENTITY,
                });

                this.authToken = authorizationResult.auth_token;
                const account = authorizationResult.accounts[0];
                this.updateAuthorizedAccount(account);

                const signedPayloads = await wallet.signMessages({
                    addresses: [this.accountAddressBase64!],
                    payloads: [messageBytes],
                });
                const signedPayload = signedPayloads[0];

                if (!signedPayload) {
                    throw new Error('No signed payload returned');
                }

                const signatureBytes = signedPayload.slice(-64);
                return Buffer.from(signatureBytes).toString('base64');
            });
        } catch (error) {
            console.error('❌ Failed to sign message:', error);
            throw error;
        }
    }

    /**
     * Sign and send a Solana transaction using the mobile wallet adapter
     */
    async signAndSendSolanaTransaction(transaction: Transaction): Promise<{ signature: string }> {
        console.log('📱 Signing and sending Solana transaction with mobile wallet...');
        
        if (!this.connected || !this.publicKey) {
            throw new Error('Wallet not connected');
        }

        try {
            const result = await transact(async (wallet) => {
                const authorizationResult = await wallet.reauthorize({
                    auth_token: this.authToken!,
                    identity: APP_IDENTITY,
                });
                
                this.authToken = authorizationResult.auth_token;
                const account = authorizationResult.accounts[0];
                this.updateAuthorizedAccount(account);
                
                console.log('📱 Updated wallet public key:', this.publicKey.toString());
                
                // Set the fee payer if not already set
                if (!transaction.feePayer) {
                    transaction.feePayer = this.publicKey!;
                }
                
                console.log('📱 Transaction prepared for signing:', {
                    hasBlockhash: !!transaction.recentBlockhash,
                    feePayer: transaction.feePayer.toString(),
                    instructionsCount: transaction.instructions.length
                });
                
                // Use the Mobile Wallet Adapter to sign and send
                const signatures = await wallet.signAndSendTransactions({
                    transactions: [transaction],
                    skipPreflight: true,
                    commitment: 'processed'
                });
                
                console.log('📱 Transaction signed and sent successfully with signature:', signatures[0]);
                
                return { signature: signatures[0] };
            });
            
            console.log('✅ Solana transaction signed and sent successfully');
            return result;
            
        } catch (error) {
            console.error('❌ Failed to sign and send Solana transaction:', error);
            throw error;
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    getPublicKey(): PublicKey | null {
        return this.publicKey;
    }

    getAuthToken(): string | null {
        return this.authToken;
    }
} 
