# Production release work

Initial deployment: GroSuite, 50 employees, Google Play Console account available. Hosting account and Apple Developer membership are not yet confirmed.

## Required before staff use

1. Provision a production Cloudflare account/database/API origin and configure the server-side admin bridge. Keep test and production databases separate. Choose an India-appropriate data location and contractual arrangement with the provider based on GroSuite's requirements.
2. Finalize the package identifiers (`in.grosuite.field` is currently a proposed identifier), app icon, signing owner, privacy policy URL, support contact, and location disclosure. Configure signing secrets through the build provider, never source control.
3. Generate signed Android development builds and an internal-test AAB using GroSuite's existing Play Console account. Complete the platform's background-location and data-safety review. App store acceptance is not assumed.
4. For iOS, obtain Apple Developer access, configure signing, and test a development build on physical iPhones before TestFlight submission.
5. Test continuous shifts with the screen locked, stationary/slow movement, battery saver, force-stop, permission revocation, airplane mode, reboot, poor GPS, weak network, and device time skew. Check location capture, stale-state UI, queue recovery, battery consumption, and that off-duty collection stops. OS force-stop can stop delivery until the app is relaunched.
6. Verify monitoring/alerts, authentication boundaries, secret rotation, dependency review, rate limiting/WAF, audit logging, backups, restore procedures, retention and deletion. The source includes device rate limits and bounded retention cleanup; an immutable audit trail, backup schedule, and incident alerting are still to be implemented/configured.
7. Browser interaction/accessibility tests and native UI tests are still required. This session ran HTTP integration tests and builds, not visual/browser automation or physical-device tests.
8. Add required operational workflows before launch: roster import/edit/deactivation, shared manager roles if needed, pagination, audit views and historical reports. No HRMS/payroll integration is connected yet.
9. Run a 2-person pilot, then 10, then all 50. Establish acceptable battery use, sample freshness, offline recovery time, and support procedures using measured results.

## Capacity assumptions

At one location every 30 seconds during an eight-hour shift, 50 employees produce roughly 48,000 points/day and 1.44 million points over 30 days. Actual volume depends on OS delivery and movement. Test this workload and its query patterns before accepting a performance or cost commitment. The preview has not been load-tested at this scale.

## Retention

The standalone Worker defaults to 30 days of server location history and accepts at most seven-day-old offline uploads. Confirm these periods with GroSuite before rollout. Cleanup runs hourly in batches of 10,000, so expired data is removed asynchronously. Attendance records are separate and are not deleted by location retention. Backup retention, employee data export/deletion, and iOS backup treatment need explicit operational policies.

## Known limitations

- Background tracking cannot promise a fixed interval or survive every force-stop/OS/vendor power policy.
- No geofences, selfie attendance, biometric checks, leave, expenses, payroll, order management, or push notifications are included.
- An Android/iOS bundle export is not an installable signed mobile application.
- The private review dashboard is not the production API for native devices.
- Changing the dashboard to an external backend does not migrate preview records automatically. Recreate test records or perform an explicit migration before switching real users.
- Basemap tiles use OpenStreetMap's public tile service in the preview. Select and configure a supported production map/tile provider and attribution before a wider rollout.
