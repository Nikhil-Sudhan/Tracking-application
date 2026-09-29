# Backend overview and installation guide

This guide explains what the GroSuite Field backend does and how to deploy it. First identify whether the destination is a Hostinger Ubuntu VPS or Microsoft Azure App Service. They are different hosting products and do not use the same deployment procedure.

## What the backend is

The backend is a Node.js 24 HTTP service that serves the admin website and provides the APIs used by both Android apps. It handles employee and admin-device pairing, location uploads, clock-in/out, attendance-site checks, tasks, leave requests, and admin reports. The website signs in with a workspace password; mobile devices use separate revocable keys.

This release uses SQLite for operational data and applies versioned migrations at startup. The database must be kept on durable storage with working file locking. The service currently expects one application instance. It is not a stateless API and must not be deployed with ephemeral database storage or multiple replicas.

## Identify the server before installing

- **Hostinger Ubuntu VPS:** you have an Ubuntu machine with SSH access, such as `root@SERVER_IP`. This is the deployment target currently implemented and documented in [`../deploy/README.md`](../deploy/README.md). It runs the Node service in Docker, stores SQLite in a Docker volume, and uses Caddy for HTTPS.
- **Microsoft Azure App Service:** you have an App Service resource, normally with an `*.azurewebsites.net` hostname, configured in the Azure portal or Azure CLI. This is a managed platform; it is not a Hostinger VPS. Continue with the Azure compatibility section below before deploying.

If the server details are unclear, check the provider dashboard and confirm whether it shows an Ubuntu VPS with SSH/root access or an Azure App Service resource. Do not run the VPS install script against App Service.

## Install on the supported Hostinger Ubuntu VPS

The current release is prepared for this route:

1. Confirm the server is Ubuntu, that Docker Engine and the Compose plugin can be installed, and that ports 80 and 443 can be used or routed through the server's existing reverse proxy. Do not take over ports used by another site.
2. Point a domain's DNS A record at the VPS and choose a strong workspace password. Do not put passwords, private keys, or `.env` files in GitHub.
3. From Windows PowerShell, copy the release archive and checksum to the VPS using the commands in [`../deploy/README.md`](../deploy/README.md).
4. SSH to the VPS, verify the SHA-256 checksum, extract the archive into a new release directory, and follow that file's `bash deploy/setup.sh` instructions.
5. Verify the HTTPS `/health` endpoint, sign in to the admin site, and complete the employee and admin phone pairing and field checks in the deployment guide.
6. Configure protected off-server backups and test restoration before real employee tracking begins.

The release guide has exact commands and acceptance checks. A successful local build or GitHub push does not install the service on the VPS.

## Azure App Service compatibility

**Do not deploy this SQLite release to Azure App Service for live attendance/location data yet.** The current backend writes its SQLite database to a local file. Azure App Service custom Linux containers need persistent storage enabled for files under `/home`, but Azure's storage guidance says mounted Azure Storage is not recommended for local databases such as SQLite or applications relying on file locks. App Service storage is also shared across scaled instances, while this service requires a single writer/instance. This needs a database design decision and deployment validation before employee data is stored there.

The existing `deploy/compose.yml` is also not an Azure App Service deployment file: it builds an app image locally and starts a separate Caddy container. App Service custom-container deployment expects a published image, routes HTTP to one exposed container port, and provides HTTPS at the platform edge. Use an Azure-specific image and configuration rather than starting the Compose stack unchanged.

### Azure deployment outline after the database is made App Service safe

These steps are a deployment outline, **not an approved live installation for the current SQLite build**:

1. Add and validate a supported durable database adapter for Azure (for example, a managed relational database) and update the backend's migrations, connection configuration, and backup/restore procedures. Keep the SQLite adapter for local tests if useful.
2. Build a single-container image from `deploy/Dockerfile`, publish it to Azure Container Registry (or another supported container registry), and configure App Service to pull that image. Prefer managed identity for ACR access.
3. Set App Service's container port to `8080` (`WEBSITES_PORT=8080`). The Node service listens on `0.0.0.0:8080`; Azure terminates HTTPS, so do not run the Caddy service from `deploy/compose.yml` inside App Service.
4. Configure the required secrets and database connection as App Service settings: `ADMIN_PASSWORD_HASH`, `WORKSPACE_ID`, `TRUST_PROXY=true`, and the secure-cookie setting. Generate the password hash with the repository's `backend/password.mjs` helper in a trusted environment; never commit the resulting secret.
5. Keep the app at one instance until database concurrency and background maintenance are designed for scaling. Configure health checks, logs, domain/TLS, database backups, and restore drills.
6. Run the full acceptance sequence in [`SERVER-HANDOFF.md`](SERVER-HANDOFF.md), including geofence boundary tests on real phones, before calling the deployment ready.

Azure App Service requires a custom image to be pushed to a registry. Azure's documentation covers [custom container configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-custom-container), [custom-container quickstart](https://learn.microsoft.com/en-us/azure/app-service/quickstart-custom-container), and [Azure Storage mounts](https://learn.microsoft.com/en-us/azure/app-service/configure-connect-to-azure-storage). In particular, its storage guidance advises against using mounted Azure Storage for SQLite/local database files.

## Operational notes

- The admin website and API share one HTTPS origin. Both Android apps use that origin with their own type of device key.
- The database contains employee location and attendance information. Restrict access, keep backups encrypted and private, and set a retention period suitable for company policy.
- Do not scale the SQLite service to multiple instances. Its in-memory web sessions also end when the service restarts.
- Automatic geofence entry/exit notifications are not included. Geofences currently enforce clock-in site checks.
- See [`SERVER-HANDOFF.md`](SERVER-HANDOFF.md) for implemented scope, limitations, and outstanding acceptance checks.
