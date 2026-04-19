# Cold-Start Android Setup (Mac)

Build Hoshino from source on a Mac that has nothing installed, install it on a connected Android device, and end with Metro connected for live development.

This is for people who need to build and run from source. If you just want to install and play the app, see [INSTALL_APK.md](INSTALL_APK.md) — that path does not need any of this.

If you are an AI helping a non-technical user through this, read this whole file before answering, then walk them through one section at a time. After each terminal command, ask the user what output they saw before continuing. Do not skip steps, do not assume any prior install.

## What you will end up with

- Node.js 20, Java 17, Android Studio, Android SDK, `adb`, and a GitHub auth set up
- The Hoshino repo cloned locally
- A connected Seeker or Android phone visible to `adb`
- The Hoshino dev build installed on the device
- Metro running in a terminal with the phone app connected to it

Expect 60-90 minutes the first time, most of it waiting on downloads and the first gradle build.

## 0. Hardware checklist

- A Mac with 20GB free disk space
- An Android phone (Seeker, Pixel, Samsung, etc.) running Android 9+
- A USB-C data cable that supports data transfer. Some cables are charge-only — if `adb devices` shows nothing in step 9, swap cables before anything else.

## 1. Install Homebrew

Homebrew is the Mac package manager. Open `Terminal` (Cmd+Space, type `Terminal`, Enter) and paste this:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the prompts. It will ask for your Mac password — type it (the cursor won't move, that's normal) and press Enter.

At the very end, it prints two lines that start with `echo`. Copy both, paste into terminal, press Enter. Those lines add `brew` to your shell PATH.

Verify:

```bash
brew --version
```

You should see `Homebrew X.Y.Z`.

## 2. Install Node.js 20

```bash
brew install node@20
brew link --force --overwrite node@20
```

Verify:

```bash
node --version
```

Should print `v20.x.x`. If it prints `v18` or `v21`, run `brew link --force --overwrite node@20` again and restart Terminal.

## 3. Install Java 17

Android builds need Java 17 specifically. Not 21, not 11.

```bash
brew install openjdk@17
sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk
```

On Intel Macs replace `/opt/homebrew` with `/usr/local` in both commands.

Add Java to your shell:

```bash
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 17)' >> ~/.zshrc
source ~/.zshrc
```

Verify:

```bash
java -version
```

Should include `17.0.x`.

## 4. Install Android Studio

1. Download from https://developer.android.com/studio
2. Open the downloaded `.dmg`, drag `Android Studio` to `Applications`.
3. Open Android Studio from Applications.
4. On the setup wizard, choose `Standard` install. Accept all license prompts. It will download ~3GB of SDK components. Let it finish.
5. On the "Welcome" window, click `More Actions` → `SDK Manager`.
6. In the `SDK Platforms` tab, check `Android 14 (API 34)` if not already. Click `Apply`.
7. In the `SDK Tools` tab, make sure `Android SDK Build-Tools`, `Android SDK Platform-Tools`, and `Android SDK Command-line Tools (latest)` are checked. Click `Apply`.

Now add the SDK to your shell PATH. The SDK lives at `~/Library/Android/sdk`.

```bash
cat >> ~/.zshrc <<'EOF'
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
EOF
source ~/.zshrc
```

Accept all Android SDK licenses (required for gradle builds to run):

```bash
yes | sdkmanager --licenses
```

Verify:

```bash
adb --version
```

Should print `Android Debug Bridge version 1.x.x`. If `adb: command not found`, the PATH export did not take — close and reopen Terminal, then re-try.

## 5. Install Git and GitHub CLI

```bash
brew install git gh
```

Authenticate with GitHub (needed to clone the repo, even though it is public, because the CLI gives you HTTPS credentials):

```bash
gh auth login
```

Choose: `GitHub.com` → `HTTPS` → `Y` (yes, authenticate git) → `Login with a web browser`. It prints a one-time code, opens a browser, and you paste the code.

## 6. Clone the Hoshino repo

Pick where to put the code. A common choice:

```bash
mkdir -p ~/dev
cd ~/dev
gh repo clone Hoshino55555/Hoshino
cd Hoshino
```

From now on, all commands should run from the `Hoshino` directory.

## 7. Install project dependencies

```bash
npm install
```

This takes 2-5 minutes the first time. It will print warnings about peer deps — those are expected, ignore them. It is done when the prompt returns.

## 8. Set up the `.env` file

Copy the example file:

```bash
cp env.example .env
```

Open `.env` in a text editor:

```bash
open -e .env
```

Fill in the values. For device-side testing you need:

- `EXPO_PUBLIC_PRIVY_APP_ID`
- `EXPO_PUBLIC_PRIVY_CLIENT_ID`
- `REACT_APP_FIREBASE_*` (all six)

The `OPENAI_API_KEY`, `GEMINI_API_KEY`, and `XAI_API_KEY` values are only used by the backend and are not needed on the device.

Save and close the editor.

Get the actual values from whoever owns this project. Don't commit `.env` — it is already in `.gitignore`.

## 9. Connect the phone

On the phone:

1. Open `Settings` → `About phone`.
2. Tap `Build number` seven times. It will say "You are now a developer."
3. Go back to `Settings` → `System` → `Developer options`.
4. Turn on `USB debugging`.
5. Plug the phone into the Mac with a USB-C data cable.
6. If a prompt says "Use USB for", choose `File Transfer` (not `Charging`).
7. If a prompt says "Allow USB debugging from this computer?", tap `Allow`. Check `Always allow` so you don't see this again.

On the Mac:

```bash
adb devices
```

You should see one line with a serial and the word `device`. If it says `unauthorized`, the "Allow USB debugging" dialog was missed on the phone — unplug, replug, and accept the dialog. If you see nothing at all, swap the USB cable.

## 10. Build and install the dev client

From the `Hoshino` directory:

```bash
npx expo run:android
```

Expect:

- 10-20 minutes of gradle output on the first run. It looks stuck when it's building native modules. It's not. Let it finish.
- Metro starts in the same terminal after the build finishes.
- The phone installs the app and launches it automatically.

The terminal now has Metro running. Do not close it. If you close it, the app on the phone will show a red error screen when you reopen it.

If the app opens to the login screen, setup is done. Proceed to the expected behavior check below.

## 11. Expected behavior after first launch

- The Hoshino login screen appears. It offers `Native Wallet`, `Phantom`, `Backpack`, `Email`, and `Google`.
- Email login opens a code input screen. A verification code is sent to the address.
- Google login opens a browser sheet for account selection.
- Native Wallet (Seeker only) opens the Seeker wallet UI to approve a Sign-In-With-Solana message.
- Logout returns to the login screen.
- Same-wallet relogin restores the saved Moonoko/profile state.

## Troubleshooting

### `adb: command not found`

Your PATH is missing the Android platform-tools directory. Run:

```bash
echo 'export PATH=$PATH:$HOME/Library/Android/sdk/platform-tools' >> ~/.zshrc
source ~/.zshrc
```

Then try `adb --version` again.

### `Failed to install the app`

Uninstall the old version from the phone and retry:

```bash
adb uninstall com.socks.hoshino
npx expo run:android
```

### App opens but shows a red error screen

Metro is probably not running, or the phone cannot reach the Mac over USB. In the Metro terminal, press `r` to reload. If that doesn't help, close the app on the phone, then run:

```bash
npx expo start --dev-client --clear
```

And reopen the app.

### `Embedded wallet proxy not initialized`

This happens when the dev client's native modules don't match what's in `node_modules`. Rebuild:

```bash
npx expo run:android
```

### `Native app ID com.socks.hoshino has not been set as an allowed...`

The Privy dashboard config is missing this app. In the Privy dashboard:

- Open the mobile client used by this app
- Under allowed identifiers, add Android package `com.socks.hoshino`
- Add URL scheme `hoshino`
- Save

Then reopen the app.

### Metro cache feels stale (old UI, missing features)

```bash
npx expo start --dev-client --clear
```

Leave it running. Reopen the app on the phone.

### Gradle build fails with a Java error

Confirm Java 17 is the active version:

```bash
java -version
echo $JAVA_HOME
```

If either shows Java 21 or 11, go back to step 3 and redo the `JAVA_HOME` export.

### `adb devices` shows `unauthorized`

The phone never showed or never accepted the "Allow USB debugging" prompt. Unplug the cable, plug it back in, watch the phone for a popup, tap `Allow` with `Always allow from this computer` checked.

### `adb devices` shows nothing

In order of likelihood:

1. USB cable is charge-only — try a different cable.
2. Phone's USB mode is `Charging only` — pull down the notification shade, tap the USB notification, set to `File Transfer`.
3. USB debugging not enabled — redo step 9.

## Prompt for Claude

If you hand this repo to Claude Code, paste this prompt and let it drive:

```text
Set up Hoshino on my Android device. I am non-technical.

Work through docs/SETUP_ANDROID.md one section at a time. After every terminal command, stop and ask me what output I see. Do not move on until I confirm the previous step worked. Do not skip sections. Do not assume any prior install.

If any step fails, check the Troubleshooting section at the bottom of SETUP_ANDROID.md before suggesting anything custom.
```
