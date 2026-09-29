# GroSuite Field — Ubuntu VPS handoff

This folder deploys the **admin website and API together**. The two Android apps connect to that same HTTPS address. The server starts with an empty workspace; test employees are never added by deployment.

## Copy now; deploy when ready

Run this in Windows PowerShell to copy the archive and checksum:

```powershell
scp "F:\live tracking\outputs\release\GroSuite-0.2.0-server.tar.gz" "F:\live tracking\outputs\release\GroSuite-0.2.0-server.tar.gz.sha256" root@147.79.71.231:/root/
```

Then connect with `ssh root@147.79.71.231`. On Ubuntu, verify the upload and extract it into a new release directory:

```bash
cd /root
sha256sum -c GroSuite-0.2.0-server.tar.gz.sha256
# Continue only when the checksum reports OK.
release_dir=$(mktemp -d /opt/grosuite-0.2.0.XXXXXX)
tar -xzf GroSuite-0.2.0-server.tar.gz -C "$release_dir" --no-same-owner
cd "$release_dir/grosuite"
pwd
```

Keep the directory intact: the Docker build needs the root package files, web source, backend, and migrations. The archive includes no database, demo seeding script, environment secrets or default login. A fresh data volume starts empty; an existing deployment keeps its records. The Android APKs are separate files in `outputs/android` on the Windows machine and are not needed to build the server.

When continuing the setup with Codex on the VPS, open this directory and say:

> Finish deploying this GroSuite release. Read deploy/README.md and docs/SERVER-HANDOFF.md. Inspect existing services before changing ports. Verify HTTPS, login, both mobile APIs, backups and real Android tracking.

No deployment or server changes have been performed by this build task.

## Requirements

- Ubuntu with Docker Engine and the Compose plugin. Follow [Docker’s Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/).
- A domain such as `field.yourcompany.com` with an A record pointing to `147.79.71.231`. Remove incorrect AAAA records. Do not use the example domain literally.
- Inbound ports 80 and 443 available for Caddy. If the VPS already has a proxy or hosts another site, integrate its existing proxy before starting this Compose stack.
- A workspace password of at least 14 characters. It is entered interactively and saved only as a salted scrypt hash.

## Start

From the extracted project root:

```bash
bash deploy/setup.sh
```

The script asks for the domain and password on first run, creates a private `deploy/.env`, builds the website, starts the API, and lets Caddy obtain HTTPS certificates. It preserves existing configuration on subsequent runs. It does not install Docker or change firewall rules.

```bash
docker compose -p grosuite -f deploy/compose.yml ps
docker compose -p grosuite -f deploy/compose.yml logs --tail=100 app caddy
curl --fail https://YOUR_DOMAIN/health
```

Open the HTTPS domain and sign in. In **Team**, add employees and generate one device key per phone. Install `GroSuite-Field-0.2.0.apk`, enter the HTTPS origin and employee key. In **Admin devices**, create a viewer or manager key. Install `GroSuite-Admin-0.2.0.apk` and enter the same origin with that admin key. Keys are not interchangeable.

## Attendance and tracking test

1. Create a site in **Sites & geofences**, assign its exact team name, and choose a radius between 50 and 10,000 metres. Leave team empty to cover everyone.
2. Clock in outside the boundary: expect rejection. Clock in inside with a fresh, accurate GPS fix: expect success and a verified site in Attendance.
3. Lock the employee phone and walk. Verify timestamps and route points advance in the website and admin app. Android targets a GPS update every 30 seconds; admin views poll every 15 seconds. OS and network delivery can be slower.
4. Test airplane mode and reconnection. Locations remain queued until acknowledged; an offline clock-out stops collection locally and syncs later. Starting work requires network access, and site-based clock-in also requires a fresh fix.
5. Finish work outside the site: collection must stop. No geofence restriction prevents clock-out.
6. Request leave in the employee app; review it in the admin app or website.
7. Pair a viewer admin and verify write actions are absent and rejected by the API. Revoke a phone key and verify its next request is rejected.

Reported mock locations are rejected, but this is not hardware-backed device attestation. The system cannot prove that an untrusted or rooted device reports truthful GPS.

## Data and backups

SQLite lives in the persistent `grosuite_field-data` Docker volume, outside the image. Startup applies new migrations transactionally and checks hashes of previously applied migrations. Never edit an applied migration. Run one API replica with this SQLite deployment.

Create a consistent live backup, then copy it off the VPS:

```bash
docker compose -p grosuite -f deploy/compose.yml exec app node backend/backup.mjs
docker compose -p grosuite -f deploy/compose.yml cp app:/data/field-backup.sqlite ./field-backup.sqlite
```

The backup contains employee data and hashed access keys. Protect it like the live database. Test restoration in an isolated stack before rollout. Stop the app before replacing a database, preserve the current volume, and restore ownership to the container's `node` user. Do not run `docker compose down -v` on live data.

`LOCATION_RETENTION_DAYS` defaults to 30 (supported: 7–365). Minute maintenance deletes old location batches and clears old roster coordinates. Attendance, leaves and the activity log persist; separate HR retention policy is not implemented. Sessions expire after 12 hours or server restart. Admin phone keys expire after 30 days and can be revoked individually.

Map tiles use OpenStreetMap’s public service with attribution and normal caching. Its availability is best effort; use a contracted or self-hosted tile provider for a larger rollout. See [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Updates

Back up first. Copy the next release into a separate directory, carry over `deploy/.env` with restrictive permissions, preserve the Compose project name `grosuite`, then run setup. Do not copy an empty database over the persistent volume. Database migrations may prevent safely rolling back to an older image; restore a tested backup into a separate recovery volume when necessary.
