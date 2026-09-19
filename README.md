# GroSuite Field

Admin dashboard and Android/iOS employee app source for GroSuite's initial 50-person field team.

The working core covers employee management, device pairing/revocation, on-duty GPS updates, offline queues, route history, shift attendance, field tasks and CSV export. Sample data is separate from the real workspace.

**Release status:** functional implementation, private review deployment, and a locally signed Android pilot APK. See [Android installation and rebuild instructions](docs/ANDROID-PILOT.md). Public backend setup and physical-device validation remain required; this is not a certified production release.

## Project layout

- `app/`: web dashboard and private API routes.
- `lib/tracking-service.ts`: shared validated tracking operations and workspace access checks.
- `db/` and `drizzle/`: database schema and immutable generated migrations.
- `backend/`: mobile-accessible Worker and production deployment instructions.
- `mobile/`: Expo React Native Android/iOS app.
- `tests/`: database-backed security and workflow tests.
- `docs/PRODUCT.md`: reference-product analysis and exact scope.
- `docs/RELEASE.md`: deployment, physical-device testing, and operational gaps.

## Local development

Use Node 24 and npm. The web app and mobile app have separate lockfiles.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_nifty_scalphunter.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_past_energizer.sql
npm run dev
```

Apply each local migration once; do not replay it against an existing database. Open the URL printed by the development server. Local sign-in uses `/signin-with-chatgpt?return_to=/` and a development-only seeded identity. Hosting uses the platform sign-in gateway.

```sh
npm run typecheck
npm test
npm run test:smoke
cd mobile
npm ci
npm run typecheck
npx expo export --platform android --platform ios
```

The HTTP smoke test requires the local server and creates one test employee. It prints the path to a cleanup SQL file; apply that file only to the local DB using the same Wrangler command. Never point the smoke test at production.

## Deployment

The private dashboard is built for Sites. Native apps require the separate API in [backend/README.md](backend/README.md). Set the server-only bridge variables to give both surfaces the same production database. The private dashboard's sign-in URL is not a mobile API origin.

Android/iOS development builds and signing instructions are in [mobile/README.md](mobile/README.md). No store submission has been performed.
