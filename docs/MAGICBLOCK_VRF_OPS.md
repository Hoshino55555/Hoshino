# MagicBlock VRF Ops

This branch adds a dedicated Anchor consumer program plus a React Native `VRFService` wrapper for Hoshino gameplay calls.

## Current State

- Consumer program crate: `programs/hoshino-vrf-consumer`
- Checked-in IDL: `idl/hoshino_vrf_consumer.json`
- App config: `src/config/vrf.ts`
- App service: `src/services/VRFService.ts`
- Dev harness: `src/components/_dev/VRFTest.tsx`
- Cluster target: devnet
- Deployment status: deployed on devnet on 2026-04-19

Current deploy details:

- Program id: `CSQ7mu1XoBv171bXFBhYCFNcLHp2Xbpa9voExh8qfBbp`
- Deploy signature: `fshsfH248eqjaqfiYDnZnYvTiNX3qBcGkvnpvvACqfk1YK1cnTcBvgEzf5VaEoPDQ35r8w4AKdnfn7PM58ksdA8`
- Last confirmed deploy slot at time of writing: `456568298`
- First successful smoke-test request: `8r2YFwbLkCtFZVioFmADEqR9k4rbFwxLYW6j76osweZPK5F4i8twJ1FPgPXqUNjh4NYCUqEe5Efx9T91TVp8QN8`

## Program IDs

| Surface | Devnet | Mainnet |
| --- | --- | --- |
| Hoshino VRF consumer | `CSQ7mu1XoBv171bXFBhYCFNcLHp2Xbpa9voExh8qfBbp` | Not deployed |
| MagicBlock VRF program | `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz` | Confirm from current MagicBlock docs before using |
| MagicBlock VRF identity | `9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw` | Confirm from current MagicBlock docs before using |
| MagicBlock default queue | `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh` | Confirm from current MagicBlock docs before using |

The consumer program ID above comes from the local deploy keypair under `target/deploy/hoshino_vrf_consumer-keypair.json`. That file is intentionally ignored and should not be committed.

## Redeploy

Prereqs:

- Solana CLI installed and configured
- Anchor CLI `0.31.1`
- Wallet available at `~/.config/solana/id.json`
- Devnet SOL available for deploy and request fees

Build:

```bash
anchor build
```

Deploy to devnet:

```bash
anchor deploy --provider.cluster Devnet
```

Confirm the deployed program id:

```bash
solana address -k target/deploy/hoshino_vrf_consumer-keypair.json
solana program show --programs -u devnet | rg hoshino_vrf_consumer -n
```

After a successful deploy:

1. Update `src/config/vrf.ts` if the deploy key changed.
2. Flip `VRF_RUNTIME_CONFIG.deployed` to `true`.
3. Rebuild the app and exercise `VRFTest`.
4. If the instruction surface changed, regenerate and re-check in `idl/hoshino_vrf_consumer.json`.

## Fees

Two payer models, picked per call site:

**Client-signed (gacha, Starburst seed):**
- The connected user wallet signs and pays.
- Acceptable because these are explicit user actions ("pull a character", "start minigame") — one prompt per intent.

**Server-signed (foraging):**
- A dedicated server keypair pays for all foraging VRF requests, once per user per 24h window.
- Foraging resolves lazily on every `getGameState` call; prompting the user's wallet per tick (up to 96/day) is unacceptable UX, so the backend owns the payer.
- Fallback: if the VRF request fails or times out, foraging degrades to HMAC-SHA256 so gameplay never blocks on Solana. Logged as a warning but not surfaced to the user.

### Server-signer setup (foraging path)

The foraging path lives in [backend/firebase/functions/vrf-requester.js](../backend/firebase/functions/vrf-requester.js) and is gated by the `FORAGING_RNG_MODE` env var (`hmac` by default, `vrf` opts in).

To enable the VRF path:

1. Generate a dedicated keypair (do not reuse your personal wallet):
   ```bash
   solana-keygen new --outfile ~/.config/solana/hoshino-vrf-signer.json --no-bip39-passphrase
   solana address -k ~/.config/solana/hoshino-vrf-signer.json
   ```
2. Airdrop devnet SOL to the keypair (a few SOL covers many thousands of requests):
   ```bash
   solana airdrop 2 <SIGNER_PUBKEY> --url devnet
   ```
3. Store the keypair as a Firebase secret. The value is the **entire JSON array** from the keyfile:
   ```bash
   cat ~/.config/solana/hoshino-vrf-signer.json | firebase functions:secrets:set FORAGING_VRF_SIGNER_SECRET_KEY
   ```
4. Set the RNG mode:
   ```bash
   firebase functions:config:set foraging.rng_mode=vrf   # or set via secrets / env
   ```
5. Deploy functions and verify by calling `getGameState` — Firestore will grow a `users/{uid}/vrf/window-<startMs>` doc after the first VRF request fulfills.

### Cost envelope (devnet)

- 1 on-chain tx per user per 24h (~0.00001 SOL base fee + MagicBlock per-request fee).
- At 1000 DAU with a 24h window: ~1000 txs/day. Low 5-figure lamport spend. Trivial on devnet.
- Scale lever: widen `VRF_WINDOW_MS` in [foraging-rng.js](../backend/firebase/functions/foraging-rng.js) to reduce requests per user at the cost of larger correlation windows.

Operational implication:

- Dev harness (client-signed path) prompts are acceptable.
- Gameplay gacha still prompts on each pull — swap to Privy signer when the session-key path lands.
- Foraging never prompts — server-signer handles the whole loop.

## Failure Modes

### Build or IDL drift

- Symptom: `anchor build` fails or the app request instruction starts failing on-chain.
- Response: rebuild first, then compare `idl/hoshino_vrf_consumer.json` with `target/idl/hoshino_vrf_consumer.json`. The TS client assumes the checked-in IDL account order.

### Request submitted but fulfillment is slow

- Symptom: `VRFService.fetchSeed()` times out after `fulfillmentTimeoutMs`.
- Response: do not generate a fresh nonce immediately. Reuse the same `(user, purpose, nonce)` tuple and keep polling the same PDA. That preserves idempotency and avoids charging for a second request unintentionally.

### Request never appears on-chain

- Symptom: no request PDA account exists after submit.
- Likely causes: signer rejected, insufficient SOL, wrong program id, wrong queue/program accounts, or the consumer program is not deployed.
- Response: inspect the wallet signature, confirm `src/config/vrf.ts`, and verify the consumer program is deployed to devnet.

### Fulfillment lands after the client gave up

- Symptom: app timed out locally, but the PDA later shows `fulfilled`.
- Response: treat the original request as authoritative. The caller can fetch the same PDA using the original nonce and continue from the stored randomness.

### Duplicate billing due to replay with a new nonce

- Symptom: the same user action accidentally creates multiple requests.
- Response: upstream callers must pass a deterministic nonce for user-intent actions they may retry. A new nonce means a new payable request.

## Retry Posture

- Safe retry: reuse the same `VRFContext.nonce` and poll/read the same request PDA.
- Unsafe retry: call again without a nonce or with a fresh nonce after a timeout.

For gameplay integrations, the caller should derive a stable nonce from the user intent:

- onboarding pull: wallet + `"onboarding"`
- daily pull: wallet + calendar day
- forage roll: wallet + interval window start
- Starburst seed: wallet + game session id

## Verification

Use the dev screen after deploy:

1. Set `EXPO_PUBLIC_ENABLE_VRF_DEV_SCREEN=1`.
2. Launch the app in dev mode.
3. Open the `VRF` screen.
4. Connect a wallet.
5. Run `Pick Index`, `Pick Weighted`, and `Fetch Seed`.

Expected result:

- a request transaction is signed
- the request PDA is created
- the callback fills `randomness`
- the screen renders the final value or seed
