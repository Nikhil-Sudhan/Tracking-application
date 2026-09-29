# GroSuite 0.2 server continuation

User's plan: build locally, copy the product to their Hostinger Ubuntu VPS, then continue deployment there. Target: `root@147.79.71.231`. Android first. **Do not assume credentials, domain, available ports, or that deployment has occurred.**

## What is included

- Employee Android app: pairing, on-duty background GPS, offline upload queue, clock-out recovery, tasks, attendance history, assigned site policy, leave requests and decision status.
- Separate admin Android app (`in.grosuite.admin`): live map, roster/search/status filters, timestamp/accuracy/battery details, 24-hour routes, shift attendance, task assignment/status and leave approval, viewer/manager roles. Does not request device location permissions.
- Admin website: shared live map/roster, employee and device administration, task board, filtered attendance CSV, map-based attendance-site editor, leave approvals, current stale/GPS/battery alerts, activity log, revocable admin-phone keys.
- Node 24 API with SQLite, password-protected web sessions, hashed phone keys, request limits, persistent migrations, retention maintenance, Docker and Caddy HTTPS setup.
- Existing Sites/Cloudflare deployment path remains in source; the self-hosted path has no Sites dependency at runtime.

## Scope limits that remain real

- VPS Docker build, actual domain/certificate, backup restoration, phone background tracking and battery tests still need deployment/device validation.
- Android scheduling is best effort. Force-stop, disabled permissions, OEM power management and network loss can delay GPS. UI marks locations stale after five minutes.
- Attendance geofences gate clock-in. There are no automatic boundary-enter/exit push notifications. Clock-out always remains available.
- Activity events are an operational history, not a tamper-proof compliance ledger. Payroll, shifts/rosters, expenses, selfie verification, push notifications, MDM and hardware attestation are not implemented.
- Single workspace owner web password. Admin phones have individual expiring keys and viewer/manager roles. Web multi-user SSO is not part of the VPS variant.
- This is a pilot release, not a claim of certified production readiness.

## Server continuation checklist

1. Read `deploy/README.md`; inspect Ubuntu version, free disk/RAM, installed Docker, existing listeners and reverse proxy. Do not disrupt other hosted applications.
2. Verify DNS and obtain the user's chosen hostname. Run `bash deploy/setup.sh` with a private workspace password.
3. Inspect health and logs, verify HTTP redirects to HTTPS and unauthenticated roster requests return 401. No default production password exists.
4. Add a test employee and site, pair both Android APKs, and complete the documented real-device test sequence.
5. Make a live SQLite backup and test restoration in isolation. Configure VPS monitoring and an off-server backup schedule with the user.
6. Report the actual HTTPS address, installed versions and device-test results. Do not call a local build a deployment.
