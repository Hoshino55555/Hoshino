# Hoshino

Hoshino is an Expo/React Native virtual-pet game built around Moonokos, Privy auth, and Solana wallet login.

This branch targets Android dev builds on real devices. Do not use Expo Go for auth or wallet flows.

## Pick your path

Two ways to get Hoshino running:

### Just want to play/test it on a device

You do not need to install anything on a computer.

Go to [docs/INSTALL_APK.md](docs/INSTALL_APK.md). Open that guide on the phone, download the latest `.apk` release, tap to install. ~5 minutes.

### Building from source

You need a Mac, 20GB free disk, and about 60-90 minutes the first time.

Go to [docs/SETUP_ANDROID.md](docs/SETUP_ANDROID.md) for a cold-start guide that assumes nothing is installed. It walks through Node, Java, Android SDK, GitHub auth, Privy config, device debugging, and the first build.

If your machine is already set up, the short version is:

```bash
gh repo clone Hoshino55555/Hoshino
cd Hoshino
npm install
cp env.example .env   # fill in Privy + Firebase values
npx expo run:android
```

## Docs index

Everything else lives in [docs/](docs/).

- [docs/INSTALL_APK.md](docs/INSTALL_APK.md) — sideload the release APK on a phone (no computer needed)
- [docs/SETUP_ANDROID.md](docs/SETUP_ANDROID.md) — cold-start build-from-source guide for Mac
- [docs/DIRECTION.md](docs/DIRECTION.md) — **canonical** MVP scope, mechanics, architecture, open questions
- [docs/MAGICBLOCK_VRF.md](docs/MAGICBLOCK_VRF.md) — VRF integration spec
- [docs/MAGICBLOCK_VRF_OPS.md](docs/MAGICBLOCK_VRF_OPS.md) — VRF deploy/ops notes (program IDs, redeploy steps)
- [docs/DEV_NOTES.md](docs/DEV_NOTES.md) — **stale**, archived for reference
- [docs/TODO.md](docs/TODO.md) — **stale**, archived for reference

When doc content disagrees, [docs/DIRECTION.md](docs/DIRECTION.md) wins.

## Prompt for Claude

If you hand this repo to Claude Code, paste this to start:

```text
Set up Hoshino on my device.

If I want to install and play the app without building, follow docs/INSTALL_APK.md.
If I want to build from source, follow docs/SETUP_ANDROID.md.

Work through the chosen guide one section at a time. After every terminal command or tap, ask me what I see before moving to the next step. Do not assume any prior install. Do not skip sections.

If anything fails, check the Troubleshooting section of the chosen guide before suggesting anything custom.
```

## Notes

- Seeker testing uses the `Native Wallet` login option in-app.
- Wallet identity and local gameplay state are stored per wallet address.
- Same-wallet relogin should restore the saved Moonoko/profile state.
- Backend redeploy is separate from device setup and is not required for frontend testing.
