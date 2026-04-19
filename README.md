# Hoshino

Hoshino is an Expo/React Native game built around Moonokos, Solana wallet login, and Privy auth.

This branch is set up for real device testing on Android, especially Solana Seeker. It does not use Expo Go for the main auth flow.

## What You Need

- Node.js 20+
- npm
- Android Studio
- Android SDK + platform tools
- Java 17
- A real Android device or emulator
- A Privy app + client ID

For Seeker/native wallet testing, use a real Solana Seeker device.

## Quick Start

### 1. Clone and install

```bash
git clone <your-repo-url>
cd Hoshino
npm install
```

### 2. Create your env file

```bash
cp env.example .env
```

At minimum, set:

```bash
EXPO_PUBLIC_PRIVY_APP_ID=...
EXPO_PUBLIC_PRIVY_CLIENT_ID=...
EXPO_PUBLIC_ENABLE_VRF_DEV_SCREEN=0
```

If you need backend features, also fill in the Firebase and model keys from `env.example`.

### 3. Configure Privy correctly

In the Privy dashboard, the mobile app client must allow this app:

- Android package: `com.socks.hoshino`
- URL scheme: `hoshino`

If you want wallet login:

- enable Solana wallet auth
- enable the login methods you want to support

For the current app flow, the important paths are:

- `Native Wallet` for Seeker / Mobile Wallet Adapter
- `Phantom`
- `Backpack`
- `Email`
- `Google`

### 4. Start Android

Use a dev build, not Expo Go:

```bash
npx expo run:android
```

That installs the native app and starts Metro if needed.

If you want a clean rebuild after dependency or Metro changes:

```bash
npx expo start -c
npx expo run:android
```

## Real Device Flow

### Android phone

1. Enable developer options and USB debugging.
2. Plug the device into your computer.
3. Confirm `adb devices` shows the phone.
4. Run `npx expo run:android`.

### Solana Seeker

1. Install the Hoshino dev build on the Seeker.
2. Open the app.
3. Tap `Connect Wallet`.
4. Choose `Native Wallet`.
5. Approve the wallet connection in Seeker.
6. Sign the Privy SIWS login message.

After first login, the app now restores the same wallet's saved Moonoko/profile on relogin.

## Important Notes

- Do not use Expo Go for this branch. Privy native extensions and wallet flows require a dev build.
- Cold launch, logout, and relogin were tested against the current Privy + wallet flow.
- Wallet identity and gameplay profile are stored locally per wallet address.
- If you log out and log back in with the same wallet, the app should restore your saved character state.

## Troubleshooting

### `Embedded wallet proxy not initialized`

This branch should no longer hit that on startup. If it does, rebuild the dev client:

```bash
npx expo run:android
```

### `Native app ID com.socks.hoshino has not been set as an allowed...`

Your Privy mobile client is missing the Android allowlist entry. Add:

- package: `com.socks.hoshino`
- scheme: `hoshino`

### Wallet login opens but never completes

Check:

- Solana wallet auth is enabled in Privy
- the app client is a mobile client, not just a web client
- you are using a dev build, not Expo Go

### Metro or bundling issues

Clear Metro and rebuild:

```bash
npx expo start -c
npx expo run:android
```

## Files That Matter

- `src/components/LoginScreen.tsx` - login UI and wallet auth entry points
- `src/contexts/PrivyContext.tsx` - Privy provider
- `src/contexts/WalletContext.tsx` - active wallet identity and signer handling
- `src/services/MobileWalletService.ts` - Mobile Wallet Adapter flow for Seeker/native wallet
- `App.tsx` - profile restore, logout behavior, app routing
- `env.example` - required environment variables

## If You Want To Hand This To An AI

Give your AI this prompt:

```text
Set up this Hoshino repo on my Android device using the repo README only.

Constraints:
- Use a real Expo dev build, not Expo Go.
- Read env.example and create .env from it.
- Make sure Privy is configured for Android package com.socks.hoshino and URL scheme hoshino.
- Make sure wallet login works for Native Wallet, Phantom, and Backpack.
- Use npx expo run:android for install/build.
- If Metro gets weird, clear it with npx expo start -c before rebuilding.
- Do not change app code unless setup is actually broken.
```

## Backend

Most frontend/device work does not require redeploying backend services.

If you need Firebase Functions locally or want to redeploy them, handle that separately from device setup.
