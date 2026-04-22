# Account Linking & Merge — Open Question

**Status:** Parked. Revisit once MagicBlock integration shape is clearer.
**Owner:** TBD
**Last touched:** 2026-04-22

## Problem

A user can sign into Hoshino via two disjoint auth paths:

1. **Email / Google** → Privy creates an embedded Solana wallet. Gamestate is keyed by Privy `user.id` → Firebase UID → `/gameStates/{uid}`.
2. **External wallet** (Seeker MWA / Phantom / Backpack) via SIWS → Privy creates a different `user.id`, different Firebase UID, different gamestate doc.

If the same human logs in via path 1, plays for a week, then tries path 2 (or vice versa), they see a fresh account. Progress is not lost — it's just stranded under a different Privy identity. We need a way to (a) prevent divergence and (b) recover when it happens.

## Two phases

### Phase 1 — Link (prevent divergence)

Privy's link hooks mirror the login hooks already in [LoginScreen.tsx](src/components/LoginScreen.tsx):

- `useLinkWithEmail` / `useLinkWithOAuth` — wallet-first user adds email/Google
- `useLinkWithSiws` — email-first user adds a Solana wallet

Linking attaches to the **same `user.id`** → same Firebase UID → same gamestate doc. Zero data movement. Build a Settings → "Linked methods" screen + a soft prompt on first login.

### Phase 2 — Merge (recover from divergence)

Privy does **not** merge two separate `user.id`s server-side. We'd build a Cloud Function:

1. User is logged in as account **A**. Opens a "I had another account" flow.
2. Second Privy login in a modal → proves ownership of account **B** (email code or wallet sign). Client captures B's access token without replacing active session.
3. `mergeAccounts({ otherPrivyToken })`:
   - Verifies B's token via `@privy-io/server-auth` → gets B's UID
   - Reads `/gameStates/{A}` and `/gameStates/{B}`
   - Merges with **max-wins**: highest hunger/mood/energy, higher currency, union of item inventory + whitelist claims + owned NFT mint list
   - Writes merged state to A, tombstones B (`{ mergedInto: A, mergedAt: ts }`)
4. Client refetches state.

## MagicBlock complication (why this is parked)

The merge design above assumes gamestate lives entirely in Firestore. MagicBlock changes that:

- **If stat state moves into a MagicBlock ephemeral rollup**, the owning pubkey is the wallet that initialized the session. Merging two on-chain states means either closing one rollup and replaying its deltas into the other, or writing a program that accepts two proofs of ownership and consolidates — either way, much harder than merging Firestore docs.
- **Session keys** (delegated signers): if a user changes primary wallets, session keys tied to the old wallet need to be re-issued. Link flow needs to trigger re-delegation.
- **VRF-consumed randomness** committed to a specific wallet can't be re-bound. Any random draw already made for account B stays associated with B's pubkey.

Until we know which pieces of state live on MagicBlock vs. Firestore, we can't design the merge rules.

## Decisions to make later

- **NFTs are unmergeable on-chain.** Embedded-wallet NFTs stay on the embedded wallet. Options: (a) document, only merge off-chain state; (b) add a "transfer NFTs" step that signs with B's wallet. Beta answer is likely (a).
- **Merge direction.** Stay on A, absorb B (cleaner) vs. let user pick (more reauth).
- **Merge strategy.** Max-wins (simplest), additive (risk of double-credit), user-chooses (most UX work).
- **Seeker prompt.** For Seeker users, nudge them to login *with Seeker first* so embedded-wallet NFT stranding doesn't happen.
- **What lives where.** Which parts of gamestate are Firestore-only, which move to MagicBlock, which are mirrored. This gates everything else.

## Scope estimate (ballpark)

- Phase 1: ~4h (Firestore-only world). Unknown if MagicBlock adds delegation work.
- Phase 2: ~1d (Firestore-only). Much higher if any merged state is on-chain.

## When to pick this back up

- After MagicBlock VRF integration lands and we know the on-chain / off-chain split
- Or sooner if a beta user hits the divergence problem in practice
