import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import {
    Connection,
    PublicKey,
    SYSVAR_SLOT_HASHES_PUBKEY,
    SystemProgram,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js';
import {
    MAGICBLOCK_VRF_PROGRAM_ID,
    VRF_ORACLE_QUEUE,
    VRF_PROGRAM_ID,
    VRF_PURPOSE_CODES,
    type VRFPurpose,
} from '../config/vrf';

const VRF_REQUEST_SEED = 'vrf-request';
const PROGRAM_IDENTITY_SEED = 'identity';
const REQUEST_RANDOMNESS_DISCRIMINATOR = Buffer.from([
    213, 5, 173, 166, 37, 236, 31, 18,
]);
const VRF_REQUEST_ACCOUNT_DISCRIMINATOR = Buffer.from([
    153, 180, 194, 105, 91, 34, 95, 113,
]);

export interface VRFContext {
    purpose: VRFPurpose;
    userPubkey: string;
    nonce?: string;
}

export interface VRFSigner {
    publicKey: PublicKey;
    signAndSend(tx: Transaction): Promise<string>;
}

export interface VRFService {
    pickIndex(upperBound: number, context: VRFContext): Promise<number>;
    pickDistinct(
        upperBound: number,
        count: number,
        context: VRFContext
    ): Promise<number[]>;
    pickWeighted<T extends string>(
        weights: Record<T, number>,
        context: VRFContext
    ): Promise<T>;
    fetchSeed(context: VRFContext): Promise<Uint8Array>;
}

export interface MagicBlockVRFServiceOptions {
    connection: Connection;
    signer: VRFSigner;
    programId?: PublicKey;
    oracleQueue?: PublicKey;
    vrfProgramId?: PublicKey;
    timeoutMs?: number;
    pollIntervalMs?: number;
    deployed?: boolean;
}

export interface VrfRequestAccount {
    bump: number;
    user: PublicKey;
    purpose: number;
    nonce: Uint8Array;
    oracleQueue: PublicKey;
    status: 'pending' | 'fulfilled';
    randomness: Uint8Array;
    requestedAt: number;
    fulfilledAt: number;
}

export class MagicBlockVRFService implements VRFService {
    private readonly connection: Connection;
    private readonly signer: VRFSigner;
    private readonly programId: PublicKey;
    private readonly oracleQueue: PublicKey;
    private readonly vrfProgramId: PublicKey;
    private readonly timeoutMs: number;
    private readonly pollIntervalMs: number;
    private readonly deployed: boolean;

    constructor(options: MagicBlockVRFServiceOptions) {
        this.connection = options.connection;
        this.signer = options.signer;
        this.programId = options.programId ?? new PublicKey(VRF_PROGRAM_ID);
        this.oracleQueue = options.oracleQueue ?? new PublicKey(VRF_ORACLE_QUEUE);
        this.vrfProgramId =
            options.vrfProgramId ?? new PublicKey(MAGICBLOCK_VRF_PROGRAM_ID);
        this.timeoutMs = options.timeoutMs ?? 15000;
        this.pollIntervalMs = options.pollIntervalMs ?? 1000;
        this.deployed = options.deployed ?? false;
    }

    async pickIndex(upperBound: number, context: VRFContext): Promise<number> {
        assertPositiveInteger(upperBound, 'upperBound');
        const seed = await this.fetchSeed(context);
        return toBoundedIndex(seed, upperBound);
    }

    async pickDistinct(
        upperBound: number,
        count: number,
        context: VRFContext
    ): Promise<number[]> {
        assertPositiveInteger(upperBound, 'upperBound');
        assertPositiveInteger(count, 'count');

        if (count > upperBound) {
            throw new Error('count cannot be greater than upperBound');
        }

        const seed = await this.fetchSeed(context);
        const random = createDeterministicRandom(seed);
        const values = Array.from({ length: upperBound }, (_, index) => index);

        for (let index = values.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(random() * (index + 1));
            [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
        }

        return values.slice(0, count);
    }

    async pickWeighted<T extends string>(
        weights: Record<T, number>,
        context: VRFContext
    ): Promise<T> {
        const entries = Object.entries(weights) as Array<[T, number]>;

        if (entries.length === 0) {
            throw new Error('weights must include at least one entry');
        }

        const totalWeight = entries.reduce((sum, [, weight]) => {
            if (!Number.isFinite(weight) || weight <= 0) {
                throw new Error('weights must be positive finite numbers');
            }
            return sum + weight;
        }, 0);

        const seed = await this.fetchSeed(context);
        let cursor = toUnitInterval(seed) * totalWeight;

        for (const [id, weight] of entries) {
            cursor -= weight;
            if (cursor < 0) {
                return id;
            }
        }

        return entries[entries.length - 1][0];
    }

    async fetchSeed(context: VRFContext): Promise<Uint8Array> {
        this.assertConfigured();

        const user = new PublicKey(context.userPubkey);
        const purposeCode = getPurposeCode(context.purpose);
        const nonceSeed = await deriveNonceSeed(context);
        const callerSeed = await deriveCallerSeed(context, nonceSeed);
        const requestPda = deriveRequestPda(this.programId, user, purposeCode, nonceSeed);

        const existing = await this.fetchRequestAccount(requestPda);

        if (!existing) {
            await this.submitRequest({
                user,
                requestPda,
                purposeCode,
                nonceSeed,
                callerSeed,
            });
        } else if (existing.status === 'fulfilled') {
            return existing.randomness;
        }

        const fulfilled = await this.waitForFulfillment(requestPda);
        return fulfilled.randomness;
    }

    async getRequestAccount(context: VRFContext): Promise<VrfRequestAccount | null> {
        const user = new PublicKey(context.userPubkey);
        const purposeCode = getPurposeCode(context.purpose);
        const nonceSeed = await deriveNonceSeed(context);
        const requestPda = deriveRequestPda(this.programId, user, purposeCode, nonceSeed);
        return this.fetchRequestAccount(requestPda);
    }

    private assertConfigured() {
        if (!this.deployed) {
            throw new Error(
                'VRF program is scaffolded but not marked as deployed yet. Set VRF_RUNTIME_CONFIG.deployed once the devnet deployment is live.'
            );
        }
    }

    private async submitRequest(params: {
        user: PublicKey;
        requestPda: PublicKey;
        purposeCode: number;
        nonceSeed: Uint8Array;
        callerSeed: Uint8Array;
    }): Promise<string> {
        const instruction = this.buildRequestInstruction(params);
        const { blockhash, lastValidBlockHeight } =
            await this.connection.getLatestBlockhash('confirmed');

        const transaction = new Transaction({
            feePayer: this.signer.publicKey,
            blockhash,
            lastValidBlockHeight,
        }).add(instruction);

        const signature = await this.signer.signAndSend(transaction);

        await this.connection.confirmTransaction(
            {
                signature,
                blockhash,
                lastValidBlockHeight,
            },
            'confirmed'
        );

        return signature;
    }

    private buildRequestInstruction(params: {
        user: PublicKey;
        requestPda: PublicKey;
        purposeCode: number;
        nonceSeed: Uint8Array;
        callerSeed: Uint8Array;
    }): TransactionInstruction {
        const programIdentity = deriveProgramIdentityPda(this.programId);
        const data = Buffer.concat([
            REQUEST_RANDOMNESS_DISCRIMINATOR,
            Buffer.from([params.purposeCode]),
            Buffer.from(params.nonceSeed),
            Buffer.from(params.callerSeed),
        ]);

        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                {
                    pubkey: this.signer.publicKey,
                    isSigner: true,
                    isWritable: true,
                },
                {
                    pubkey: params.user,
                    isSigner: false,
                    isWritable: false,
                },
                {
                    pubkey: params.requestPda,
                    isSigner: false,
                    isWritable: true,
                },
                {
                    pubkey: this.oracleQueue,
                    isSigner: false,
                    isWritable: true,
                },
                {
                    pubkey: SystemProgram.programId,
                    isSigner: false,
                    isWritable: false,
                },
                {
                    pubkey: programIdentity,
                    isSigner: false,
                    isWritable: false,
                },
                {
                    pubkey: this.vrfProgramId,
                    isSigner: false,
                    isWritable: false,
                },
                {
                    pubkey: SYSVAR_SLOT_HASHES_PUBKEY,
                    isSigner: false,
                    isWritable: false,
                },
            ],
            data,
        });
    }

    private async waitForFulfillment(requestPda: PublicKey): Promise<VrfRequestAccount> {
        const startedAt = Date.now();

        while (Date.now() - startedAt < this.timeoutMs) {
            const account = await this.fetchRequestAccount(requestPda);
            if (account?.status === 'fulfilled') {
                return account;
            }
            await sleep(this.pollIntervalMs);
        }

        throw new Error(
            `Timed out waiting for VRF fulfillment after ${this.timeoutMs}ms`
        );
    }

    private async fetchRequestAccount(
        requestPda: PublicKey
    ): Promise<VrfRequestAccount | null> {
        const accountInfo = await this.connection.getAccountInfo(requestPda, 'confirmed');
        if (!accountInfo?.data) {
            return null;
        }

        return decodeVrfRequestAccount(accountInfo.data);
    }
}

function getPurposeCode(purpose: VRFPurpose): number {
    return VRF_PURPOSE_CODES[purpose];
}

function deriveRequestPda(
    programId: PublicKey,
    user: PublicKey,
    purposeCode: number,
    nonceSeed: Uint8Array
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from(VRF_REQUEST_SEED),
            user.toBuffer(),
            Buffer.from([purposeCode]),
            Buffer.from(nonceSeed),
        ],
        programId
    )[0];
}

function deriveProgramIdentityPda(programId: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(PROGRAM_IDENTITY_SEED)],
        programId
    )[0];
}

async function deriveNonceSeed(context: VRFContext): Promise<Uint8Array> {
    if (context.nonce) {
        return sha256(Buffer.from(context.nonce, 'utf8'));
    }

    return sha256(
        Buffer.from(
            `${context.purpose}:${context.userPubkey}:${Date.now()}:${Math.random()}`,
            'utf8'
        )
    );
}

async function deriveCallerSeed(
    context: VRFContext,
    nonceSeed: Uint8Array
): Promise<Uint8Array> {
    return sha256(
        Buffer.concat([
            Buffer.from('hoshino-vrf', 'utf8'),
            Buffer.from(context.purpose, 'utf8'),
            Buffer.from(context.userPubkey, 'utf8'),
            Buffer.from(nonceSeed),
        ])
    );
}

function decodeVrfRequestAccount(data: Buffer): VrfRequestAccount {
    const buffer = Buffer.from(data);

    if (buffer.length < 155) {
        throw new Error('VRF request account is too small to decode');
    }

    const discriminator = buffer.subarray(0, 8);
    if (!discriminator.equals(VRF_REQUEST_ACCOUNT_DISCRIMINATOR)) {
        throw new Error('Unexpected account discriminator for VRF request account');
    }

    let offset = 8;
    const bump = buffer.readUInt8(offset);
    offset += 1;

    const user = new PublicKey(buffer.subarray(offset, offset + 32));
    offset += 32;

    const purpose = buffer.readUInt8(offset);
    offset += 1;

    const nonce = Uint8Array.from(buffer.subarray(offset, offset + 32));
    offset += 32;

    const oracleQueue = new PublicKey(buffer.subarray(offset, offset + 32));
    offset += 32;

    const statusCode = buffer.readUInt8(offset);
    offset += 1;

    const randomness = Uint8Array.from(buffer.subarray(offset, offset + 32));
    offset += 32;

    const requestedAt = readI64(buffer, offset);
    offset += 8;

    const fulfilledAt = readI64(buffer, offset);

    return {
        bump,
        user,
        purpose,
        nonce,
        oracleQueue,
        status: statusCode === 1 ? 'fulfilled' : 'pending',
        randomness,
        requestedAt,
        fulfilledAt,
    };
}

function readI64(buffer: Buffer, offset: number): number {
    const low = buffer.readUInt32LE(offset);
    const high = buffer.readInt32LE(offset + 4);
    return high * 2 ** 32 + low;
}

function assertPositiveInteger(value: number, label: string) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${label} must be a positive integer`);
    }
}

async function sha256(input: Buffer): Promise<Uint8Array> {
    const digest = await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        Uint8Array.from(input)
    );
    return new Uint8Array(digest);
}

function toBoundedIndex(seed: Uint8Array, upperBound: number): number {
    const randomValue = readU32(seed, 0);
    return randomValue % upperBound;
}

function toUnitInterval(seed: Uint8Array): number {
    return readU32(seed, 0) / 0xffffffff;
}

function readU32(seed: Uint8Array, offset: number): number {
    const view = new DataView(
        seed.buffer,
        seed.byteOffset,
        seed.byteLength
    );
    return view.getUint32(offset, true);
}

function createDeterministicRandom(seed: Uint8Array): () => number {
    let state =
        readU32(seed, 0) ^
        readU32(seed, 4) ^
        readU32(seed, 8) ^
        readU32(seed, 12);

    if (state === 0) {
        state = 0x6d2b79f5;
    }

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
