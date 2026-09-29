# GroSuite 0.2 local validation

Validated on the Windows build workstation, 23 September 2026. No VPS deployment was performed.

## Passed

- Release cleanup: removed the local demo seeding script and both generated preview databases. The self-hosted HTTP test verifies a newly migrated workspace returns empty employees, tasks, shifts, geofences, leaves, activity and admin-device lists before creating isolated test fixtures. Rebuilt the web assets and transfer archive after cleanup. Archive checks reject runtime databases and demo preview entry points and verify Linux shell permissions and LF line endings.
- Root TypeScript check and mobile TypeScript check.
- Self-hosted production web build (`npm run build:selfhost`).
- Original Sites/Vinext production build (`npm run build`) remains successful.
- Targeted ESLint for the changed dashboard, operations screens, map, tracking service, schema, self-hosted entry and Vite config.
- 12 backend/HTTP tests: tenant isolation; key hashing, rotation and revocation; idempotent clock-in; deduplicated/offline GPS handling; off-duty/mocked/invalid point rejection; task ownership; request-size bounds; geofence location/accuracy/freshness enforcement; team policy isolation; admin roles and expiry; leave validation/review; login/session/CSRF and mobile API boundaries.
- 10 mobile flow tests: viewer read-only UI; manager task submission; employee home/setup/offline startup; non-overlapping refresh; quick-start field shifts; geofence shifts waiting for GPS; delayed-location shift isolation; GPS failure recovery; immediate offline clock-out.
- Browser checks using an isolated local test database: sign-in, live map and site overlays, geofence editor and persistence, attendance table/filters, leave review layout and responsive sidebar. Desktop at 1440 px and phone at 390 px. Fixed the map bounds error and site map positioning found during these checks.
- Both Android release APKs built, signed and verified. `aapt2` confirms version `0.2.0`, code `5`, and distinct IDs `in.grosuite.field` / `in.grosuite.admin`. Embedded Expo configuration confirms employee/admin variants. The admin APK declares no location permissions.

## Still requires the server / physical phones

- Docker image execution, Caddy HTTPS issuance, actual DNS and VPS port compatibility. Docker is installed locally, but its engine is not running; the container itself has not been tested locally. The Node HTTP service and compiled web build were tested directly.
- Physical Android installation, background location delivery with the screen locked, battery use, airplane-mode recovery, rooted/mock-device behavior and on-site geofence boundary tests.
- Backup restoration in a separate environment, off-server backup scheduling and operational monitoring.
- No Play Store submission, iPhone binary or production-readiness certification.

See `deploy/README.md` for the acceptance sequence and `docs/SERVER-HANDOFF.md` for the continuation scope.
