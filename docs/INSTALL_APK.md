# Install Hoshino APK on an Android device

This is the non-technical install path. You don't need a computer, Node, Android Studio, or anything else. You need the device, Wi-Fi, and about 5 minutes.

Works on any Android phone (Seeker, Pixel, Samsung, etc.) running Android 9 or newer.

If you are an AI helping a non-technical user through this, follow the steps in order, one at a time, and wait for the user to confirm each step before moving to the next. Do not assume any prior setup.

## 1. Open the download link on the device

On the phone itself (not a computer), open the Chrome browser and go to:

```
https://github.com/Hoshino55555/Hoshino/releases/latest
```

Scroll down to the `Assets` section. Tap the file that ends in `.apk` (it will be named something like `hoshino-release.apk`).

Chrome will start downloading it. Wait for the download to finish.

## 2. Allow install from unknown sources

Android blocks installs from outside the Play Store by default. The first time you try to install an APK:

1. When the download finishes, tap the notification that says "Download complete" or open Chrome's downloads and tap the APK file.
2. Android will show a dialog like "For your security, your phone is not allowed to install unknown apps from this source."
3. Tap `Settings`.
4. Toggle `Allow from this source` on.
5. Go back. The install screen should now show.

If you don't see the notification, open the `Files` app, tap `Downloads`, then tap the APK.

## 3. Install

1. Tap `Install`.
2. Wait for the green check.
3. Tap `Open`.

Hoshino should now launch and show the login screen.

## 4. Log in

- Tap `Email` to log in with a verification code sent to your email.
- Tap `Google` to log in with a Google account.
- Tap `Native Wallet` to connect your Seeker wallet (Seeker only).

All three should work. If the login screen doesn't appear and the app is stuck on a blank or crash screen, close it, reopen it once, then let the developer know what you see.

## 5. Update later

When a new build is available, come back to:

```
https://github.com/Hoshino55555/Hoshino/releases/latest
```

Tap the new `.apk`, tap Install. Android will replace the old app with the new one. Your login is preserved.

## Common issues

### "App not installed" after tapping Install

Uninstall the old version first:

1. Long-press the Hoshino icon.
2. Tap `App info` then `Uninstall`.
3. Re-download and install the new APK.

This happens when two APKs are signed differently. Signed-with-same-key updates work; mismatched keys don't.

### Browser says "This type of file can harm your device"

That warning appears for every `.apk` file. Tap `Download anyway`.

### Install button is greyed out

Android sometimes requires you to toggle the "unknown sources" permission for the specific app you're installing from (usually Chrome or Files). Go to Settings → Apps → Chrome → Install unknown apps → Allow. Try the install again.

### App opens but immediately closes

Send a screenshot or a short screen recording to the developer. Don't try to debug it yourself.
