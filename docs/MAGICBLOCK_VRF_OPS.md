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

Current payer model:

- The request signer pays.
- In the temporary mobile-wallet path, the connected user wallet signs and pays.
- In the intended Privy path, the embedded wallet signs and pays.

There is no sponsor/relayer layer in this branch. Every new randomness request is an on-chain transaction, so it incurs normal Solana transaction fees plus whatever the MagicBlock VRF flow charges per request.

Operational implication:

- Dev harness prompts are acceptable.
- Production gameplay should move to the Privy signer path so repeated gameplay rolls do not require wallet approval on every request.

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
