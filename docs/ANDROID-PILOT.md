# GroSuite Field Android pilot

The standalone APK is written to `outputs/android/GroSuite-Field-0.1.3.apk` by `scripts/build-apk.ps1`. It includes its JavaScript bundle and does not require Expo Go, Metro, or a computer to remain running. It supports Android 7.0 and newer on 32-bit and 64-bit ARM phones.

Version 0.1.2 declares `RECEIVE_BOOT_COMPLETED`, required by Expo Task Manager's persisted location jobs. Without it, Android can crash the app when delivering GPS updates even when foreground and background location permissions are granted. The build script now synchronizes native configuration on every build. Install updates in place with `adb install -r` to retain pairing and queued data.

Version 0.1.3 requests high-accuracy locations with a 30-second Android interval and no minimum movement or deferred batching, so stationary employees can report locations. Actual delivery still depends on the OS and location availability; evaluate battery use during the pilot.

It also fixes the location queue INSERT statement, which previously had eight placeholders for seven columns and rejected every GPS point before upload. The location lifecycle tests now execute queue inserts against real SQLite to catch SQL errors.

## Install and pair

1. Send the APK to the tester and open it on their Android phone. Allow installation from the browser or file manager when Android requests it.
2. Open **GroSuite Field**.
3. Select **Set up this phone**. The manager enters the public HTTPS mobile API origin in **Company address** and the employee-specific device key in **Setup code**. The private dashboard URL is not the mobile API URL.
4. On **My day**, tap **Start work**, read the location disclosure, and grant precise location plus background location access when prompted.
5. Confirm the employee appears in the administrator's workspace. Lock the phone, walk outside, and verify new positions arrive.
6. Test airplane mode, then reconnect and use **Help → Send saved updates**. Select **Finish work** and confirm location sharing stops.

The APK alone does not deploy the tracking server. If no public API is configured, the app can open but pairing and live tracking cannot work. Follow `backend/README.md` to deploy the shared backend and connect the dashboard before employee testing.

## Rebuild on this computer

Run from the repository root in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1
```

The Android SDK, Gradle cache, temporary files, and signing material are in `E:\grosuite-build` to avoid filling C:. Node 24 comes from the installed Codex runtime; Java 17 uses the existing JDK. Override `-ToolRoot` and `-NodeDirectory` when relocating these dependencies.

Keep a private backup of `E:\grosuite-build\signing\grosuite-field.p12` and its password file. Do not send signing files to employees or commit them. Future updates must retain this signing key and increment `android.versionCode` in `mobile/app.json`, regenerate native configuration, and adjust the output filename as appropriate.

This is a pilot build. Physical-device background GPS, battery use, offline recovery, and stopping tracking after a shift must still be validated. See `docs/RELEASE.md` for wider rollout requirements.

## USB testing on the Pixel 6a

Enable **Settings → System → Developer options → USB debugging**, unlock the phone, connect a data-capable USB cable, and accept **Allow USB debugging**. Developer options being enabled alone is not enough. Windows detecting the phone for file transfer does not mean ADB is authorized.

```powershell
& E:\grosuite-build\android-sdk\platform-tools\adb.exe devices -l
& E:\grosuite-build\android-sdk\platform-tools\adb.exe install -r 'outputs/android/GroSuite-Field-0.1.1.apk'
& E:\grosuite-build\android-sdk\platform-tools\adb.exe shell am start -W -n in.grosuite.field/.MainActivity
```

Version 0.1.1 uses the same signing key as 0.1.0 and can update it in place without clearing app data. Its screens are **My day**, **My tasks**, and **Help**. Startup renders saved employee data before networking; refresh requests are deduplicated; starting work does not wait for the first GPS fix; finishing work stops local location collection before background upload completes.
