# GroSuite Field

Employee location tracking for GroSuite's initial 50-person team. Android is the first release target; the same React Native app also targets iOS.

## Reference product analysis

This is an independent implementation based on TrackoField's public product page. No proprietary source code, private APIs, or internal architecture was available or copied. Marketing claims have not been independently verified.

| Publicly advertised capability | GroSuite Field in this repository |
| --- | --- |
| Field employee tracking | Map, selected employee, last location timestamp, accuracy, battery, and stale-location status |
| Attendance | Employee-controlled shift start/end and an admin shift log |
| Task management | Assign a task to an employee; employee and admin update its status |
| Offline operation | Native SQLite queue, batched upload, idempotent point IDs, pending shift closure |
| Battery/network reports | Battery and last GPS sample; no independent network heartbeat or carrier report |
| Leave management | Not implemented |
| Expenses and receipt uploads | Not implemented |
| Payroll and salary slips | Not implemented; should integrate with GroSuite's existing payroll rather than duplicate it |
| Orders, product catalogue, discounts | Not implemented |
| Custom forms, attachments, voice notes | Not implemented |
| Targets/achievement analytics | Not implemented |

Additional implementation: per-workspace access checks, hashed revocable device keys, bounded request bodies, same-origin admin writes, CSV export, and a separate mobile API deployment entry point.

## Current delivery status

The web application and native app source are implemented for the core tracking workflow. The API is exercised with SQLite security tests and a local HTTP integration test. Android and iOS JavaScript bundles compile. This is **not a verified production release**: no signed Android AAB/APK or iOS IPA has been generated, installed, or tested on a physical device.

The private Sites dashboard can save records in its own database. A separate Cloudflare Worker is included for direct native access. Configure the dashboard's server-side bridge to that Worker to give the dashboard and native apps one database. The private Sites sign-in gateway must not be used as the native app's API origin.

## Operational behaviour

- Dashboard refreshes every 15 seconds. It is polling, not a WebSocket stream.
- Native tracking requests a balanced location fix, a 25 m distance interval, and a 30-second time interval. These are requests to the OS, not delivery guarantees.
- A sample older than five minutes is labelled **Location stale**. This does not prove the device is offline; stationary devices and OS throttling can also produce old fixes.
- Employees explicitly start tracking. Ending a shift disables local collection before syncing the closure. An offline closure reaches the server on the next successful sync; until then the dashboard may show an open, stale shift.
- Only points timestamped within that employee's shift are stored. Buffered points may arrive after shift end. Out-of-shift and older-than-seven-day uploads are rejected individually so they cannot block newer queued data.
- Location queue writes and shift closure use native SQLite exclusive transactions. Secrets use SecureStore. Android backups are disabled.
- Device-key rotation revokes the old key and closes its current server shift. The old device cannot upload after revocation, even if it is offline when revoked.
- GPS mock-location flags are rejected when supplied. This is not comprehensive anti-spoofing or device attestation.
- The map draws recorded fixes in timestamp order. It does not perform road snapping, calculate payroll mileage, or prove a visit occurred inside a geofence.
- The admin identity is supplied by Sites. Each identity currently owns an isolated workspace. Shared manager roles, employee invitations, and enterprise SSO are not implemented.
- Current list bounds: 200 recent shifts, 1,000 admin tasks, 200 employee tasks, 5,000 route points for the last 24 hours. Pagination and longer report ranges are release backlog items.

## Brand

Name: **GroSuite Field**. The web app reuses the four-colour ring from the company's public website, with dark navigation and blue action buttons. Fresh installations contain no employee or operational records.

## Sources

- [TrackoField public product page](https://trackobit.com/employee-tracking-software)
- [GroSuite company website](https://www.grosuite.in/)
- [Expo background location documentation](https://docs.expo.dev/versions/latest/sdk/location/)
- [Expo TaskManager documentation](https://docs.expo.dev/versions/latest/sdk/task-manager/)
- [Cloudflare Worker rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

Reviewed 17 September 2026. The architecture described here is our implementation, not a claim about TrackoField's internals.
