// IAPService — client side of the dual-rail IAP flow.
//
// Server (backend/firebase/functions/iap.js) is authoritative on USD price,
// token amount, treasury, and grant. Client's job is just:
//
//   1. createPurchaseIntent({ skuId, paymentToken })  ← server
//   2. Build a Solana tx that transfers `tokenAmount` of `paymentToken` to
//      `treasury`, with a Memo instruction containing the intent string.
//   3. Sign + send via the user's wallet (WalletContext signer abstraction).
//   4. confirmPurchase({ intentId, txSig })  ← server. Retries a few times
//      because parsed-tx visibility lags confirmation by a beat or two.
//
// Pay rails wired here:
//   - SOL  (SystemProgram.transfer)
//   - USDC / SKR (hand-rolled SPL transferChecked — no @solana/spl-token dep)
//
// Fiat onramp (Privy useFundWallet) is offered by a sibling component in
// Shop.tsx — IAPService stays focused on building + confirming transfers.
//
// =============================================================================
// CLIENT-SIDE BLOCKERS:
//   * Source ATA creation is NOT handled here. If the user holds USDC/SKR,
//     they have an ATA already; first-time recipients won't. Fine for the
//     SOL rail; for SPL we either fail or add an ensureAtaInstruction step
//     once the dep budget allows.
//   * Embedded-wallet provider.request signature varies by Privy SDK rev —
//     verify the `signAndSendTransaction` shape matches whatever WalletContext
//     uses today.
// =============================================================================

import {
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import type { VRFSigner } from './VRFService';

// ----- Types -----

export type IAPPaymentToken = 'SOL' | 'USDC' | 'SKR';

export type IAPSkuId =
    | 'star-fragments-small'
    | 'star-fragments-medium'
    | 'star-fragments-large'
    | 'season-pass'
    | 'bundle-starter'
    | 'bundle-themed'
    | 'bundle-bargain';

export interface CreatePurchaseIntentResult {
    intentId: string;
    skuId: IAPSkuId;
    paymentToken: IAPPaymentToken;
    treasury: string;
    mint: string | null;
    tokenAmount: number;
    decimals: number;
    memo: string;
    network: 'devnet' | 'mainnet-beta' | string;
    rpcUrl: string;
    expiresAtMs: number;
    priceUsd: number;
    usdPerToken: number;
    treasuryOwner: string;
}

export type IAPGrant =
    | { kind: 'starFragments'; amount: number; newBalance: number }
    | { kind: 'seasonPass' }
    | { kind: 'bundle'; bundleId: string };

export interface ConfirmPurchaseResult {
    success: boolean;
    granted: IAPGrant | null;
    idempotent?: boolean;
}

// ----- Callables -----

const callCreatePurchaseIntent = httpsCallable<
    { skuId: IAPSkuId; paymentToken: IAPPaymentToken },
    CreatePurchaseIntentResult
>(functions, 'createPurchaseIntent');

const callConfirmPurchase = httpsCallable<
    { intentId: string; txSig: string },
    ConfirmPurchaseResult
>(functions, 'confirmPurchase');

// ----- SPL constants -----

const TOKEN_PROGRAM_ID = new PublicKey(
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
);
const MEMO_PROGRAM_ID = new PublicKey(
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
);

function deriveAta(owner: PublicKey, mint: PublicKey): PublicKey {
    const [ata] = PublicKey.findProgramAddressSync(
        [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return ata;
}

// SPL TransferChecked — instruction layout:
//   tag (u8)  = 12
//   amount    = u64 LE
//   decimals  = u8
// Accounts: [source(W), mint, dest(W), authority(S)]
function buildSplTransferCheckedIx(args: {
    source: PublicKey;
    mint: PublicKey;
    destination: PublicKey;
    owner: PublicKey;
    amount: number;
    decimals: number;
}): TransactionInstruction {
    const data = Buffer.alloc(1 + 8 + 1);
    data.writeUInt8(12, 0);
    // u64 LE
    const big = BigInt(args.amount);
    for (let i = 0; i < 8; i++) {
        data.writeUInt8(Number((big >> BigInt(8 * i)) & 0xffn), 1 + i);
    }
    data.writeUInt8(args.decimals, 9);
    return new TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
            { pubkey: args.source, isSigner: false, isWritable: true },
            { pubkey: args.mint, isSigner: false, isWritable: false },
            { pubkey: args.destination, isSigner: false, isWritable: true },
            { pubkey: args.owner, isSigner: true, isWritable: false },
        ],
        data,
    });
}

function buildMemoIx(text: string, signer: PublicKey): TransactionInstruction {
    return new TransactionInstruction({
        programId: MEMO_PROGRAM_ID,
        // Signer included so memo is attributed to the payer in explorers.
        keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
        data: Buffer.from(text, 'utf8'),
    });
}

// ----- Public API -----

export const IAPService = {
    /**
     * High-level orchestrator: intent → build tx → sign+send → confirm.
     *
     * The signer comes from WalletContext (MWA / Phantom / Backpack / Privy
     * embedded). All four return a tx signature from `signAndSend`.
     */
    async purchaseSku(
        skuId: IAPSkuId,
        paymentToken: IAPPaymentToken,
        signer: VRFSigner
    ): Promise<ConfirmPurchaseResult> {
        // 1. Get pricing + treasury from server.
        const intentRes = await callCreatePurchaseIntent({ skuId, paymentToken });
        const intent = intentRes.data;

        // 2. Build the on-chain transfer + memo.
        const connection = new Connection(intent.rpcUrl, 'confirmed');
        const tx = await this.buildTransferTx({ intent, payer: signer.publicKey, connection });

        // 3. Sign + send via whichever wallet the user has connected.
        const signature = await signer.signAndSend(tx);

        // 4. Confirm with server (parsed-tx availability lags ~1–2s).
        const confirmRes = await this.confirmWithRetry({
            intentId: intent.intentId,
            txSig: signature,
        });
        return confirmRes;
    },

    /**
     * Builds the transfer + memo tx ready for the wallet to sign. Exposed so
     * callers can inspect / preview before actually signing if they want.
     */
    async buildTransferTx(args: {
        intent: CreatePurchaseIntentResult;
        payer: PublicKey;
        connection: Connection;
    }): Promise<Transaction> {
        const { intent, payer, connection } = args;
        const tx = new Transaction();

        if (intent.paymentToken === 'SOL') {
            tx.add(
                SystemProgram.transfer({
                    fromPubkey: payer,
                    toPubkey: new PublicKey(intent.treasury),
                    lamports: intent.tokenAmount,
                })
            );
        } else {
            if (!intent.mint) {
                throw new Error(`No mint configured for ${intent.paymentToken}`);
            }
            const mintPk = new PublicKey(intent.mint);
            const sourceAta = deriveAta(payer, mintPk);
            const destAta = new PublicKey(intent.treasury);
            tx.add(
                buildSplTransferCheckedIx({
                    source: sourceAta,
                    mint: mintPk,
                    destination: destAta,
                    owner: payer,
                    amount: intent.tokenAmount,
                    decimals: intent.decimals,
                })
            );
        }

        // Memo last — server verifies the intent string is present.
        tx.add(buildMemoIx(intent.memo, payer));

        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = payer;
        return tx;
    },

    /**
     * confirmPurchase with bounded retries — parsed transaction visibility
     * sometimes lags signature visibility by 1–3 RPC polls.
     */
    async confirmWithRetry(args: {
        intentId: string;
        txSig: string;
        attempts?: number;
        delayMs?: number;
    }): Promise<ConfirmPurchaseResult> {
        const { intentId, txSig } = args;
        const attempts = args.attempts ?? 6;
        const delayMs = args.delayMs ?? 2000;
        let lastErr: unknown;
        for (let i = 0; i < attempts; i++) {
            try {
                const res = await callConfirmPurchase({ intentId, txSig });
                return res.data;
            } catch (err: any) {
                lastErr = err;
                const msg = String(err?.message || err);
                // Server signals "not visible yet" via failed-precondition with
                // a specific suffix. Anything else is terminal.
                if (!msg.includes('Transaction not found yet')) {
                    throw err;
                }
                await new Promise((r) => setTimeout(r, delayMs));
            }
        }
        throw lastErr ?? new Error('confirmPurchase exhausted retries');
    },

    /**
     * Direct callable proxies — exported so screens can drive the flow
     * step-by-step (e.g. show preview UI before signing).
     */
    async createIntent(skuId: IAPSkuId, paymentToken: IAPPaymentToken) {
        const res = await callCreatePurchaseIntent({ skuId, paymentToken });
        return res.data;
    },
    async confirm(intentId: string, txSig: string) {
        return this.confirmWithRetry({ intentId, txSig });
    },
};

export default IAPService;
