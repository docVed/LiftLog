# LiftLog React

## 🚀 Quickstart 

<!-- Setup instructions -->

Follow this to set up android: https://docs.expo.dev/get-started/set-up-your-environment/?mode=development-build

- Install with `npm i`.
- Run `npm run android` to try it out.

## Setup

Follow the Expo environment guide for Android: https://docs.expo.dev/get-started/set-up-your-environment/?mode=development-build

```bash
npm install
```

### Android: JAVA_HOME

Gradle requires a JDK. Set `JAVA_HOME` to the bundled JDR that ships with Android Studio before running any `gradlew` or `npm run android*` command:

```bash
export JAVA_HOME=~/android-studio/jbr/
```

### Android: NDK

The native modules (`workout-worker`, `native-crypto`) require the NDK. Install `ndk;27.1.12297006` via **Android Studio → SDK Manager → SDK Tools → NDK (Side by side)** before building release variants.

---

## Android build variants

| Variant | Command | JS bundled? | NDK needed? | Notes |
|---|---|---|---|---|
| **debugOptimized** | `npm run android` | Yes | No | Debug build with JS pre-bundled. No Metro server needed after install. Fastest path to a device. |
| **release (Expo)** | `JAVA_HOME=~/android-studio/jbr/ SENTRY_DISABLE_AUTO_UPLOAD=true npm run android:release` | Yes | Yes | Release variant via Expo toolchain. Requires NDK for native modules. `SENTRY_DISABLE_AUTO_UPLOAD=true` skips the source map upload (replace with `SENTRY_AUTH_TOKEN=<token>` for real releases). |
| **release APK** | `JAVA_HOME=~/android-studio/jbr/ SENTRY_DISABLE_AUTO_UPLOAD=true ./android/gradlew -p android assembleRelease` | Yes | Yes | Fully standalone APK. Output: `android/app/build/outputs/apk/release/app-release.apk`. Requires NDK and a signing keystore. |

### When to use which

- **No NDK installed yet** → use `debugOptimized`. It runs fine on a device without a dev server.
- **Testing release behaviour** → use `android:release` (Expo manages signing for debug-signed release builds).
- **Distributing to others / sideloading** → use `assembleRelease` for a proper signed APK.

---

## Other commands

```bash
npm run web          # expo start --web
npm run ios          # expo run:ios
npm test             # vitest
npm run typecheck    # tsgo --noEmit
npm run lint         # eslint .
npm run proto        # regenerate gen/proto.{js,d.ts} from ../proto/**/*.proto
```
