# Hoshino

Hoshino is an Expo/React Native game built around Moonokos, Privy auth, and Solana wallet login.

This branch is intended for Android dev builds on real devices. Do not use Expo Go for the main auth or wallet flow.

## 5 Minute Setup

1. Clone the repo and install packages.
2. Copy `env.example` to `.env`.
3. Set `EXPO_PUBLIC_PRIVY_APP_ID` and `EXPO_PUBLIC_PRIVY_CLIENT_ID`.
4. In Privy, allow Android package `com.socks.hoshino` and URL scheme `hoshino`.
5. Run `npx expo run:android`.

Quick commands:

```bash
git clone <your-repo-url>
cd Hoshino
npm install
cp env.example .env
npx expo run:android
```

If Metro gets weird:

```bash
npx expo start -c
npx expo run:android
```

## Read This Next

- Start here for full device setup: `docs/SETUP_ANDROID.md`
- VRF branch notes: `docs/MAGICBLOCK_VRF.md`
- VRF ops notes: `docs/MAGICBLOCK_VRF_OPS.md`
- Required environment variables: `env.example`

## AI Setup

If you hand this repo to another AI, tell it to read these in order:

1. `README.md`
2. `docs/SETUP_ANDROID.md`
3. `env.example`

Use this prompt:

```text
Set up this Hoshino repo on my Android device.

Read these files first and follow them in order:
1. README.md
2. docs/SETUP_ANDROID.md
3. env.example

Constraints:
- Use a real Expo dev build, not Expo Go.
- Configure Privy for Android package com.socks.hoshino and URL scheme hoshino.
- Support wallet login for Native Wallet, Phantom, and Backpack.
- Use npx expo run:android for install/build.
- If Metro acts stale, clear it with npx expo start -c before rebuilding.
- Do not change app code unless setup is actually broken.
```

## Notes

- Seeker testing should use the `Native Wallet` path in-app.
- Wallet identity and local gameplay state are stored per wallet address.
- Same-wallet relogin should restore the saved Moonoko/profile state.
- Backend redeploy is separate from device setup and is not required for normal frontend testing.
