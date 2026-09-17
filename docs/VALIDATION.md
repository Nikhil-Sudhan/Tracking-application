# Validation record

17 September 2026, local Windows environment with Node 24.

Passed:

- Web production build through the Sites build helper.
- TypeScript checks for web/backend and mobile.
- ESLint for the authored web views, route handlers, shared tracking service and Worker.
- Seven SQLite-backed tests covering workspace isolation, device-key hashing/rotation/revocation, idempotent clock-in, one-active-shift uniqueness, duplicate/out-of-order uploads, off-duty/foreign-shift/invalid location rejection, task ownership, and request limits.
- Local HTTP integration test: anonymous admin denied; authenticated employee creation and pairing; native-key clock-in and GPS upload; admin roster update and route lookup; task completion; clock-out; revoked key denied; cross-origin admin write denied. Test records were removed from the local database.
- Expo Android and iOS JavaScript bundle export.
- Standalone Worker dry-run bundle with D1, rate-limit binding and retention configuration.

Not performed:

- Browser interaction or screenshot-based layout testing.
- Physical Android/iOS device tests, battery measurements, force-stop/reboot recovery or a multi-day field pilot.
- Signed native builds, Play Console upload or Apple/TestFlight submission.
- Production cloud-account provisioning, admin bridge configuration or production load testing.
- Backup restore drill, penetration testing or incident-alert verification.

Passing the checks above does not establish production readiness. See `RELEASE.md` for the remaining work.
