# Next steps: King's Vendetta on the iPhone App Store

The goal is a native iPhone app built from Windows, with no Mac, using **Expo + EAS**.

## Approach: an Expo app wrapping the game in `react-native-webview`

The game is already static files with relative paths and touch-first input, so the same folder drops into the app unchanged.

1. `npx create-expo-app kings-vendetta-app` (TypeScript template is fine).
2. `npx expo install react-native-webview expo-haptics expo-av expo-asset expo-file-system expo-splash-screen`.
3. **Bundle the game inside the app.** Do not load the GitHub Pages URL; Apple rejects apps that are "just a website" (guideline 4.2).
   - Copy `index.html`, `config.js`, `css/`, `js/`, `images/`, `manifest.json` into `app-game/` in the Expo project.
   - At startup, copy the bundled assets to `FileSystem.documentDirectory` (or use `expo-asset`), then load them with
     `<WebView source={{ uri: fileUri }} allowFileAccess originWhitelist={['*']} />`.
   - Ship supabase-js locally (download the pinned UMD build into `js/vendor/`) so the app doesn't need the CDN.
4. **Native bridge.** The game posts events with `window.ReactNativeWebView?.postMessage(JSON.stringify({type:'roll'|'kill'|'win'}))`:
   - `expo-haptics`: light impact on a dice roll, heavy impact on a kill, a success notification on a win.
   - `expo-av`: dice and sword sounds.
   - Add these `postMessage` calls in `js/ui.js` (`playAttack`, `gameOverOverlay`). On the web they're no-ops.
5. **Offline vs-AI mode** already works without a network, which helps with 4.2. Online play only needs Supabase broadcast.
6. **App icon and splash:** a 1024x1024 crest (from `images/icon.svg`) in `app.json` → `icon`, plus `splash.image` and `backgroundColor: #1b1410`.
7. `app.json`: set `ios.bundleIdentifier` (e.g. `com.ford.kingsvendetta`), `ios.buildNumber`, `orientation: portrait`, and `ios.requireFullScreen`.

## Build and ship (cloud, no Mac)

```bash
npm i -g eas-cli
eas login
eas build:configure
eas build -p ios --profile production     # cloud build; EAS creates the certificates with your Apple Developer account
eas submit -p ios --latest                # uploads to App Store Connect → TestFlight
```

- Test through TestFlight on both iPhones, then submit for App Store review from App Store Connect.
- Review notes: mention the offline AI mode, local pass-and-play, haptics, and that online play needs no account.

## Alternative: Capacitor

Capacitor (`@capacitor/ios`) also wraps the folder, but building iOS needs Xcode on a Mac (or a cloud Mac such as
Codemagic or MacinCloud). Since you're on Windows and already know Expo, EAS is the simpler path.
