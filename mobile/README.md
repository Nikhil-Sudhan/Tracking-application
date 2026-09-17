# GroSuite Field employee app

React Native + Expo SDK 57, shared Android/iOS source. Native background location requires a development build; Expo Go is not the acceptance environment.

```sh
cd mobile
npm ci
npm run typecheck
npx expo start --dev-client
```

Local Android builds require the Android SDK/JDK. Local iOS builds require macOS/Xcode. EAS can build both platforms with the appropriate Expo account, project configuration, signing credentials, and Apple/Google accounts:

```sh
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
```

Review `app.json` identifiers before generating release credentials. Use `eas.json` production profile for store builds after physical-device validation. The preview profile produces an internal Android APK. No store submission or signing has been performed.

## Pairing

1. Add an employee in the admin workspace and generate a device key.
2. Open the installed app and enter the external API origin plus the employee key.
3. Start a shift and accept foreground/background location permissions after the disclosure.
4. Verify the employee's real coordinates appear in the admin workspace.
5. End the shift and confirm native location sharing stops.

Use the public mobile Worker origin described in `backend/README.md`, not the private Sites dashboard URL. In development builds, HTTP is allowed for local API testing; release builds require HTTPS.

## Offline behaviour

Locations use SQLite with stable random IDs, batching, and exclusive transactions. The app retains them until acknowledged or individually rejected as expired/outside-shift. A failed upload does not silently become success. End-shift is saved locally and retried after queued points. When off duty, retries happen when the app becomes active or the employee selects Sync now. Starting a new shift requires the prior queue/closure to sync successfully.

Keys are stored in SecureStore and can be rotated from the dashboard. Use “Update workspace or device key” to replace a key after ending an active local shift. Switching to a different employee is blocked while the old account has queued work. Re-pairing the same employee can recover from a rotated key.

SQLite location data relies on the device app sandbox/OS protection; database-level encryption and iOS backup exclusions have not been validated. Android backup is disabled. See `docs/RELEASE.md` before collecting staff data.
