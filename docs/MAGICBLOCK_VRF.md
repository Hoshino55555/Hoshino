# MagicBlock VRF Integration — Spec for Parallel Work

> Scope: plug MagicBlock VRF into Hoshino as the provable-randomness source for gacha, foraging, and Starburst grid seeds. Ephemeral Rollups are **out of scope** for the hackathon build ([DIRECTION.md §2](../DIRECTION.md)).
>
> Owner: Codex (parallel track while Privy integration happens on the main branch).
>
> Last updated: 2026-04-19.

---

## 1. Why VRF

Three places in the app need auditable randomness:

| Surface | Current source | Needs VRF because |
|---|---|---|
| **Gacha** — free onboarding pull + daily pull rare-character chance | `Math.random()` in [MoonokoSelection.tsx:136](../src/components/MoonokoSelection.tsx) | Character drop is ownership-bearing; must be non-manipulable |
| **Foraging** — per-interval ingredient rolls (stat-gated) | Not built yet; Phase C of DIRECTION.md | Result is valuable (rare ingredients → rare recipes); resolves offline so server-authoritative PRNG isn't enough for "provable" claim |
| **Starburst** — grid seeding | `Math.random()` in [Starburst.tsx:38,61-76](../src/components/Starburst.tsx) | Minigame rewards feed soft currency; grid solvability guarantee depends on seed integrity |

The product framing from [DIRECTION.md §10](../DIRECTION.md): "Blockchain is invisible infrastructure for randomness, ownership, and optional on-chain capability — never the product." VRF is the randomness half.

---

## 2. What MagicBlock VRF provides

High-level: an on-chain VRF oracle + Solana program pattern where a consumer program requests randomness, the VRF oracle fulfills it in a subsequent transaction, and the consumer program reads the verified random bytes in a callback.

**Canonical reference:** MagicBlock docs → Tools → VRF (`docs.magicblock.gg`). Codex: please verify the current SDK surface before starting; the project moves fast and spec drift is real.

**Expected primitives we'll consume:**
- A Solana program (Anchor preferred) with:
  - `request_randomness` instruction — pushes a VRF request to the oracle
  - A callback instruction the oracle invokes to deliver the random bytes
  - PDA state storing `(request_id, consumer_pubkey, requested_at, fulfilled_bytes?)`
- A JS/TS client lib to:
  - Build `request_randomness` txs
  - Poll / subscribe for fulfillment
  - Decode random bytes into app-usable integers / picks

Confirm with their current TS SDK (likely `@magicblock-labs/…`) what's actually exposed before writing custom wrappers.

---

## 3. What Hoshino needs from this integration

The client app should never touch VRF directly — it calls a **service** with high-level asks. The service handles requests, waits for fulfillment, and returns results.

### 3.1 Service surface (target API)

Create `src/services/VRFService.ts` exporting:

```ts
export interface VRFService {
  /** Pull a single index in [0, upperBound). */
  pickIndex(upperBound: number, context: VRFContext): Promise<number>;

  /** Pull N distinct indices in [0, upperBound), order-preserving. */
  pickDistinct(upperBound: number, count: number, context: VRFContext): Promise<number[]>;

  /** Pull a weighted choice from {id → weight}. Returns the chosen id. */
  pickWeighted<T extends string>(weights: Record<T, number>, context: VRFContext): Promise<T>;

  /** Raw 32-byte seed the caller can expand themselves (for Starburst grid). */
  fetchSeed(context: VRFContext): Promise<Uint8Array>;
}

export interface VRFContext {
  /** Which game feature is asking — used for logging, fee attribution, anti-replay. */
  purpose: 'gacha_onboarding' | 'gacha_daily' | 'forage_roll' | 'starburst_seed';
  /** The user whose action triggered the roll. */
  userPubkey: string;
  /** Optional deterministic salt so a single action doesn't get rerolled. */
  nonce?: string;
}
```

### 3.2 Consumption sites (what Claude/others will wire into later)

| Site | Current state | After VRF lands |
|---|---|---|
| Free onboarding pull | Currently `Math.random()` picking from `MOONOKOS` array | `vrf.pickWeighted({ common: 70, rare: 25, epic: 5 })` then pick character within tier |
| Daily gacha | Not built | `vrf.pickWeighted(dailyPullTable)` |
| Foraging roll | Not built | `vrf.pickIndex(foragingTable.length)` per interval, stat-gated |
| Starburst grid | `Math.random()` in [Starburst.tsx](../src/components/Starburst.tsx) | `vrf.fetchSeed()` → deterministic grid generator |

**Don't** refactor those call sites yet — leave that to the Privy/main-branch work. Just land the service + a test screen that exercises it.

---

## 4. Deliverables for this branch

1. **On-chain program** (`programs/hoshino-vrf-consumer/` or similar)
   - Anchor program that requests randomness from MagicBlock VRF and stores the fulfilled bytes in a PDA keyed by `(user, purpose, nonce)`
   - Anchor IDL checked in so the client can decode
   - Devnet deployment; program ID committed to a config file the app reads
2. **`src/services/VRFService.ts`** implementing the API in §3.1
   - Internally builds `request_randomness` txs, submits via the currently-connected wallet signer (see §5 for signer handoff), polls for fulfillment, decodes bytes into the requested shape
   - Timeout + error paths (what happens if fulfillment doesn't land in N seconds?)
3. **Test harness screen** — a minimal dev-only screen at `src/components/_dev/VRFTest.tsx` (gated behind a flag) that exercises `pickIndex`, `pickWeighted`, `fetchSeed` and renders results. Proves the round-trip works on devnet before any gameplay code depends on it.
4. **Doc** at `docs/MAGICBLOCK_VRF_OPS.md` covering:
   - How to redeploy the program
   - Where fees come from (VRF oracle charges per request)
   - Devnet vs mainnet program IDs
   - Known failure modes and retry posture

---

## 5. Coordination with the Privy track

Privy is landing in parallel on the main branch. **Your blocker:** the VRF service needs a signer to submit `request_randomness` txs. Two scenarios:

- **If Privy embedded wallet is live:** use the Privy-supplied signer (session-scoped — no user prompt per VRF request). Expect an interface like `signer.signAndSendTransaction(tx)` from the Privy SDK.
- **If Privy isn't live yet:** use the existing [MobileWalletService](../src/services/MobileWalletService.ts) path — the user-connected MWA wallet signs each VRF request. User prompts per request are acceptable for the dev harness but unacceptable for production gameplay — flag this as a known gap and swap to Privy signer once available.

**Interface expectation:** take a `signer` dep-inject into `VRFService`, don't reach into a specific wallet implementation:

```ts
interface VRFSigner {
  publicKey: PublicKey;
  signAndSend(tx: Transaction): Promise<string /* signature */>;
}

new VRFService({ connection, programId, signer })
```

That way the Privy work plugs in without touching your code.

---

## 6. Out of scope

- Ephemeral Rollups / delegated accounts (Phase 2 per [DIRECTION.md §10](../DIRECTION.md))
- Mainnet deployment (devnet-only for hackathon)
- Any refactor of existing `Math.random()` call sites (that's a downstream task after the service exists)
- UI for VRF status / "rolling" animations — that's a design surface, not infra

---

## 7. Open questions for Codex

Answer by updating this doc or in commit messages:

1. **Which MagicBlock VRF variant?** There are multiple docs pages — Bolt SDK VRF vs standalone VRF oracle. Pick one, justify briefly.
2. **Fee model:** does the oracle charge per request? If yes, who pays — embedded wallet, a sponsored relayer, or the user directly? Implications for UX.
3. **Fulfillment latency:** what's the typical end-to-end latency on devnet? If >5 seconds, gacha UX needs a "rolling" state.
4. **Retry posture:** if fulfillment never lands, is the user's intent lost? How do we reconcile?
5. **Is on-chain VRF overkill for Starburst grids?** Arguable that provable randomness for a local minigame is performative. Decision: ship it anyway for consistency, or use a server-side HMAC-seeded PRNG for Starburst only? (Recommendation: ship VRF for consistency — it's what [DIRECTION.md §10](../DIRECTION.md) promises.)

---

## 8. Coordination ground rules

- **Branch:** work on `feat/magicblock-vrf` off `main`
- **Don't touch** `src/components/MoonokoSelection.tsx`, `src/components/Starburst.tsx`, or anything under `src/contexts/WalletContext.tsx` — the Privy work lives there
- **Rebase onto main** before final merge so Privy signer is available
- **Open PR early** even in draft so the Privy work can see the VRFService interface
