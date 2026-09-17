# Mobile-accessible API

This Worker reuses `lib/tracking-service.ts`; it does not duplicate business logic. Deploy it to a Cloudflare account controlled by GroSuite. The Sites dashboard proxies admin requests server-side; devices talk directly to `/api/device` with employee-specific keys.

## Setup

Use Node 24 and the root package lock. From the repository root:

```sh
npm ci
npx wrangler login
npx wrangler d1 create grosuite-field
```

Copy `backend/wrangler.example.jsonc` to `backend/wrangler.jsonc`. Replace the placeholder database ID with the returned ID, verify the account, and choose rate-limiter namespace `10501` only if it is unused in that account. Set the retention period. The real config is ignored by Git.

```sh
npx wrangler d1 migrations apply DB --remote --config backend/wrangler.jsonc
npx wrangler secret put ADMIN_BRIDGE_SECRET --config backend/wrangler.jsonc
npx wrangler deploy --config backend/wrangler.jsonc
```

Generate at least 32 random bytes as a 64-character hex bridge secret using a password manager or cryptographically secure generator. Enter it at the secret prompt; never paste it into this repository or client configuration.

In the Sites runtime, set both:

- `TRACKING_API_URL`: the deployed HTTPS Worker origin, without a path.
- `TRACKING_SERVICE_TOKEN`: the same bridge secret, stored as a secret.

Do not set only one variable: partially configured bridging fails closed. With neither set, the dashboard uses its private preview DB. After bridging, create/pair employees in that workspace; enter the external Worker origin and the employee's key in the native app. The bridge secret must never enter the browser or mobile app.

## Routes and trust boundaries

| Endpoint | Access |
| --- | --- |
| `GET /health` | Database reachability; no employee data |
| `GET /api/device` | Employee bearer key; own active shift and tasks |
| `POST /api/device` | Employee bearer key; own shifts, points and task status |
| `GET/POST /internal/admin` | Server bridge secret and scoped workspace ID |

Native tokens are hashed before lookup and never returned from roster APIs. The Worker does not trust public `oai-authenticated-*` headers. Admin identity comes only from the authenticated Sites server bridge. Device-key hashing is not password hashing; keys contain 256 random bits and are not human passwords.

The configured limit is 90 requests/minute per credential per Cloudflare location. Add account-level WAF controls for unauthenticated abuse; this limiter is not a global DDoS or quota guarantee. Do not log request bodies, credentials, or employee coordinates.

## Operations

Monitor 5xx rates, DB latency, rejected uploads, queue age, retention failures, and sustained stale locations. Configure incident alert destinations and database backup/restore routines. Validate hourly retention using test data before enabling it for production. The current source does not implement an immutable audit event store.

Never edit an applied migration. Generate and append a new one. Back up before schema changes, and test restoration in a separate environment. The provided deployment commands require the actual account and have not been run against GroSuite's production infrastructure.
