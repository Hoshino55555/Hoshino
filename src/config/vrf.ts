export const VRF_PROGRAM_ID = 'CSQ7mu1XoBv171bXFBhYCFNcLHp2Xbpa9voExh8qfBbp';
export const VRF_ORACLE_QUEUE = 'Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh';
export const MAGICBLOCK_VRF_PROGRAM_ID =
    'Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz';
export const MAGICBLOCK_VRF_PROGRAM_IDENTITY =
    '9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw';

export const VRF_RUNTIME_CONFIG = {
    cluster: 'devnet' as const,
    rpcUrl: 'https://api.devnet.solana.com',
    programId: VRF_PROGRAM_ID,
    oracleQueue: VRF_ORACLE_QUEUE,
    vrfProgramId: MAGICBLOCK_VRF_PROGRAM_ID,
    vrfProgramIdentity: MAGICBLOCK_VRF_PROGRAM_IDENTITY,
    fulfillmentTimeoutMs: 15000,
    pollIntervalMs: 1000,
    deployed: true,
};

export const ENABLE_VRF_DEV_SCREEN =
    __DEV__ && process.env.EXPO_PUBLIC_ENABLE_VRF_DEV_SCREEN === '1';

export const VRF_PURPOSE_CODES = {
    gacha_onboarding: 0,
    gacha_daily: 1,
    forage_roll: 2,
    starburst_seed: 3,
} as const;

export type VRFPurpose = keyof typeof VRF_PURPOSE_CODES;
