import {
  adminRead,
  adminWrite,
  deviceIdentity,
  deviceRead,
  deviceWrite,
  readBody,
  failure,
  ApiError,
  digest,
  adminIdentity,
  mobileAdminWrite,
} from "../lib/tracking-service";
export interface BackendEnv {
  DB: D1Database;
  ADMIN_BRIDGE_SECRET: string;
  DEVICE_LIMITER: RateLimit;
  LOCATION_RETENTION_DAYS: string;
}
function json(value: unknown) {
  return Response.json(value, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export default {
  async fetch(request: Request, env: BackendEnv): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health" && request.method === "GET") {
        await env.DB.prepare("SELECT 1").first();
        return json({ status: "ok", service: "grosuite-field" });
      }
      if (!["GET", "POST"].includes(request.method))
        return new Response(null, {
          status: 405,
          headers: { Allow: "GET, POST" },
        });
      if (
        url.pathname === "/api/device" ||
        url.pathname === "/api/admin-mobile"
      ) {
        if (!env.DEVICE_LIMITER)
          throw new ApiError(503, "Request limiter unavailable");
        const auth = request.headers.get("authorization");
        if (!auth || auth.length > 128)
          throw new ApiError(401, "Valid device key required");
        const limit = await env.DEVICE_LIMITER.limit({
          key: await digest(auth),
        });
        if (!limit.success)
          return Response.json(
            { error: "Too many requests. Retry in a minute." },
            { status: 429, headers: { "Retry-After": "60" } },
          );
        if (url.pathname === "/api/admin-mobile") {
          const admin = await adminIdentity(env.DB, auth);
          const result =
            request.method === "GET"
              ? await adminRead(
                  env.DB,
                  admin.owner,
                  url.searchParams.get("employee"),
                )
              : await mobileAdminWrite(env.DB, admin, await readBody(request));
          return json({
            ...result,
            access: { label: admin.label, role: admin.role },
          });
        }
        const employee = await deviceIdentity(env.DB, auth);
        return json(
          request.method === "GET"
            ? await deviceRead(env.DB, employee)
            : await deviceWrite(env.DB, employee, await readBody(request)),
        );
      }
      if (url.pathname === "/internal/admin") {
        if (!env.ADMIN_BRIDGE_SECRET || env.ADMIN_BRIDGE_SECRET.length < 64)
          throw new ApiError(503, "Admin bridge is not configured");
        const authorization = request.headers.get("authorization") ?? "";
        if (
          authorization.length > 200 ||
          (await digest(authorization)) !==
            (await digest("Bearer " + env.ADMIN_BRIDGE_SECRET))
        )
          throw new ApiError(401, "Unauthorized");
        const owner = request.headers.get("x-workspace-owner");
        if (!owner || owner.length > 200)
          throw new ApiError(400, "Workspace identity required");
        return json(
          request.method === "GET"
            ? await adminRead(env.DB, owner, url.searchParams.get("employee"))
            : await adminWrite(env.DB, owner, await readBody(request)),
        );
      }
      throw new ApiError(404, "Not found");
    } catch (e) {
      return failure(e);
    }
  },
  async scheduled(_event: ScheduledController, env: BackendEnv) {
    const days = Number(env.LOCATION_RETENTION_DAYS);
    if (!Number.isInteger(days) || days < 7 || days > 365)
      throw new Error(
        "Set LOCATION_RETENTION_DAYS to an integer from 7 to 365",
      );
    const cutoff = Date.now() - days * 86400000;
    // Bounded deletion; hourly executions catch up after downtime.
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM points WHERE id IN (SELECT id FROM points WHERE captured<? ORDER BY captured LIMIT 10000)",
      ).bind(cutoff),
      env.DB.prepare(
        "UPDATE employees SET lat=NULL,lng=NULL,accuracy=NULL,battery=NULL,last_seen=NULL WHERE last_seen<?",
      ).bind(cutoff),
    ]);
  },
} satisfies ExportedHandler<BackendEnv>;
