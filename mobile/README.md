# Patang Rush for Android

The Patang Rush game as an Android app for the Google Play Store.

| Part | Tech |
| --- | --- |
| Game | Phaser 4, TypeScript |
| Game rules | The shared Axia engine (`../packages/engine`), compiled in from source |
| Bundler | Vite |
| Android wrapper | Capacitor 8 (`android/`) |
| Native extras | `@capacitor/app` (back button, pause), `@capacitor/haptics` (vibration), `@capacitor/status-bar` (full screen) |

The app works fully offline. Each stage is judged on the phone by the same engine code the Axia server uses. Best scores stay on the phone.

This folder is **not** part of the pnpm workspace. It uses plain `npm`, so the website and API builds are not affected.

## What you need

- Node.js 22 or newer
- Android Studio (latest stable), with its bundled JDK and an Android SDK for API 36
- A Google Play Console developer account

## 1. Run it in a browser (quick check)

```bash
cd mobile
npm install
npm run dev
```

Open the address Vite prints. Add `?autopilot` to the URL to let a bot fly (development only).

## 2. Open it in Android Studio

```bash
cd mobile
npm install
npm run sync      # builds the game and copies it into android/
npm run open      # opens android/ in Android Studio
```

When Android Studio opens, wait for the Gradle sync to finish. Then press ▶ Run to try it on a phone (USB debugging on) or an emulator.

**Every time you change the game code, run `npm run sync` again** before building in Android Studio.

## 3. Build the release file for the Play Store (.aab)

1. In Android Studio: **Build → Generate Signed App Bundle or APK… → Android App Bundle**.
2. **Key store path → Create new…** This is your *upload key*.
   - Save the `.jks` file somewhere safe, **outside this repository**, and back it up (Google Drive, a USB stick).
   - Write down both passwords. If you lose this key you will need Google support to reset it.
3. Choose **release** and finish. The file appears at `android/app/release/app-release.aab`.

Signing files (`*.jks`, `*.keystore`) are git-ignored. Never commit them.

## 4. Each new version

Before building an update, raise both numbers in `android/app/build.gradle`:

```gradle
versionCode 2        // +1 for every upload; Play rejects a number it has seen before
versionName "1.0.1"  // what players see
```

## App details

| Setting | Value | Where |
| --- | --- | --- |
| Package name | `com.axiagames.patangrush` | `capacitor.config.ts`, `android/app/build.gradle` |
| App name | Patang Rush | `capacitor.config.ts`, `android/app/src/main/res/values/strings.xml` |
| Orientation | Portrait only | `android/app/src/main/AndroidManifest.xml` |
| Min / target SDK | 24 / 36 | `android/variables.gradle` |

**The package name can never change after the first upload.** Change it now if you want a different one (both files above), then run `npm run sync`.

## Icons and splash screen

The sources are in `assets/`. After changing them, run `npm run assets` to regenerate every Android size.

## Play Store material

`store/` holds what the Play Console asks for:

- `listing.md`: app name, short and full description
- `privacy-policy.md`: the privacy policy text (it must be hosted at a public URL)
- `play-icon-512.png`, `feature-graphic-1024x500.png`
- `screenshot-*.png`: phone screenshots (1080×1920)
