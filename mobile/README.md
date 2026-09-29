# GroSuite Field employee app

## Version 0.2: employee and admin Android apps

The same source tree builds two separate applications through `APP_VARIANT`:

- `employee`: GroSuite Field (`in.grosuite.field`), with on-duty location sharing, site-based clock-in, tasks, attendance records and leave requests.
- `admin`: GroSuite Admin (`in.grosuite.admin`), with the live team map, route history, attendance, task assignment and leave approval. Its manifest blocks location permissions; it does not track the manager's phone.

From the repository root on the configured Windows build machine:

```powershell
./scripts/build-apk.ps1 -Variant employee
./scripts/build-apk.ps1 -Variant admin
```

Signed artifacts go to `outputs/android/GroSuite-Field-0.2.0.apk` and `outputs/android/GroSuite-Admin-0.2.0.apk`. Both use the existing pilot signing key, kept outside this repository. For EAS, set `APP_VARIANT=admin` in the admin build profile environment; `app.config.js` resolves the variant during prebuild. Never distribute a debug development build as a release.

Both apps use the self-hosted HTTPS origin from [deploy/README.md](../deploy/README.md). Employee keys start with `fp_`; admin keys start with `ga_` and expire after 30 days. Create/revoke admin keys from the website's **Admin devices** page. A manager key allows operations changes; a viewer key is read-only, enforced server-side.

With an assigned active attendance site, starting a new shift waits up to 25 seconds for a fresh GPS fix. The backend enforces site membership and accuracy. Field shifts without a site retain the quick-start behavior. Finishing work is always available locally, including outside the site or offline.

The embedded admin map bundles Leaflet code locally. Only map tiles need the external provider; employee coordinates and API keys are never embedded in navigation URLs. Live overlays use data from the authorized workspace API. Android real-device checks remain required.

React Native + Expo SDK 57, shared Android/iOS source. Native background location requires a native build; Expo Go is not the acceptance environment. A standalone signed Android pilot APK and local rebuild instructions are described in [the Android pilot guide](../docs/ANDROID-PILOT.md).

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

Use `eas.json` production profile for store builds after physical-device validation. The preview profile produces an internal Android APK. Local pilot signing uses the private key documented in the Android pilot guide; no store submission has been performed.

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
