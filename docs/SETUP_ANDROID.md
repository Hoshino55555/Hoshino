# Android Setup

This is the canonical setup guide for running Hoshino on an Android device or emulator.

If you are a human skimming quickly, read `README.md` first and come here second.

If you are another AI working in this repo, start with:

1. `README.md`
2. `docs/SETUP_ANDROID.md`
3. `env.example`

## What This Branch Assumes

- Expo/React Native app
- Android dev build
- Privy mobile auth
- Solana wallet login
- Mobile Wallet Adapter support for Seeker/native wallet

This branch does not assume Expo Go.

## Prerequisites

- Node.js 20+
- npm
- Java 17
- Android Studio
- Android SDK installed
- `adb` available in your shell
- A real Android device or emulator

For Seeker-specific testing, use a real Solana Seeker.

## 1. Install Dependencies

```bash
npm install
```

## 2. Create `.env`

```bash
cp env.example .env
```

At minimum, fill in:

```bash
EXPO_PUBLIC_PRIVY_APP_ID=...
EXPO_PUBLIC_PRIVY_CLIENT_ID=...
EXPO_PUBLIC_ENABLE_VRF_DEV_SCREEN=0
```

Other values in `env.example` are only needed if you are also exercising Firebase/backend paths.

## 3. Configure Privy

Create or use a mobile Privy client and make sure it allows this app:

- Android package: `com.socks.hoshino`
- URL scheme: `hoshino`

Enable the auth methods you want to use:

- Solana wallet auth
- Email
- Google

The current login screen supports:

- `Native Wallet`
- `Phantom`
- `Backpack`
- `Email`
- `Google`

## 4. Build and Install

Use a dev build:

```bash
npx expo run:android
```

This is the expected path for the current repo state.

Do not use Expo Go for auth or wallet testing.

## 5. Real Device Steps

### Android phone

1. Enable developer options.
2. Enable USB debugging.
3. Connect the phone to your computer.
4. Verify the phone appears in `adb devices`.
5. Run `npx expo run:android`.

### Solana Seeker

1. Install the Hoshino dev build.
2. Open the app.
3. Tap `Connect Wallet`.
4. Choose `Native Wallet`.
5. Approve connection in Seeker.
6. Sign the Privy SIWS message.

## 6. Expected Behavior

After setup is correct:

- app launches without Expo Go
- Privy login screen loads
- wallet login works for `Native Wallet`, `Phantom`, and `Backpack`
- logout returns to login
- same-wallet relogin restores saved Moonoko/profile state

## 7. Troubleshooting

### `Embedded wallet proxy not initialized`

Rebuild the dev client:

```bash
npx expo run:android
```

This branch no longer intentionally boots the embedded wallet path at startup.

### `Native app ID com.socks.hoshino has not been set as an allowed...`

Fix the Privy mobile client configuration:

- Android package: `com.socks.hoshino`
- URL scheme: `hoshino`

### Wallet login opens but never finishes

Check:

- Privy app client is a mobile client
- Solana wallet auth is enabled
- you are using a dev build
- you are not using Expo Go

### Metro cache feels stale

```bash
npx expo start -c
npx expo run:android
```

### App still behaves like an old build

Uninstall the app from the device, then rebuild:

```bash
adb uninstall com.socks.hoshino
npx expo run:android
```

## 8. Files To Check If Setup Breaks

- `README.md`
- `env.example`
- `src/components/LoginScreen.tsx`
- `src/contexts/PrivyContext.tsx`
- `src/contexts/WalletContext.tsx`
- `src/services/MobileWalletService.ts`
- `App.tsx`

## 9. Teammate Environment Sharing

The safest team pattern is:

1. Keep `env.example` in git with placeholder keys only.
2. Share real `.env` values through a password manager or secure secret vault.
3. Keep one shared note that explains what each variable is for.
4. Never commit the real `.env`.

Good options:

- 1Password shared vault
- Bitwarden organization vault
- Doppler
- Infisical
- Firebase/Google Secret Manager if your team already uses GCP

For this repo, Privy IDs are usually safe enough to share internally, but API keys and backend secrets should still go through a real secret-sharing tool, not chat.
