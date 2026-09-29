import { createServer } from "node:http";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { openDatabase } from "./sqlite.mjs";
import {
  adminRead,
  adminWrite,
  adminIdentity,
  mobileAdminWrite,
  deviceIdentity,
  deviceRead,
  deviceWrite,
  readBody,
  failure,
  ApiError,
} from "../lib/tracking-service.ts";

const passwordHash = process.env.ADMIN_PASSWORD_HASH;
if (!passwordHash || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash))
  throw new Error("Set ADMIN_PASSWORD_HASH using backend/password.mjs");
const owner = process.env.WORKSPACE_ID || "grosuite";
const dataDir = process.env.DATA_DIR || resolve("backend/data");
mkdirSync(dataDir, { recursive: true });
const { db, sqlite } = openDatabase(resolve(dataDir, "field.sqlite"));
const root = resolve(
  fileURLToPath(new URL("../dist-selfhost", import.meta.url)),
);
const sessions = new Map(),
  limits = new Map();
const secure = process.env.COOKIE_SECURE !== "false";
const ttl = 12 * 60 * 60 * 1000;
const hash = (s) => createHash("sha256").update(s).digest("hex");
const json = (v, status = 200, headers = {}) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
const cookie = (token, age) =>
  `gs_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? "; Secure" : ""}`;
function limit(key, maximum) {
  const now = Date.now(),
    entry = limits.get(key);
  if (!entry || entry.until < now) {
    if (limits.size > 20000) throw new ApiError(503, "Try again shortly");
    limits.set(key, { count: 1, until: now + 60000 });
    return;
  }
  if (++entry.count > maximum)
    throw new ApiError(429, "Too many requests. Try again in a minute.");
}
function sameOrigin(request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new ApiError(403, "Same-origin request required");
}
async function handle(request, ip) {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === "/health") {
    await db.prepare("SELECT 1").first();
    return json({ status: "ok", service: "grosuite-field" });
  }
  if (!["GET", "POST"].includes(request.method))
    return json({ error: "Method not allowed" }, 405, { Allow: "GET, POST" });
  if (path === "/api/login" && request.method === "POST") {
    sameOrigin(request);
    limit("login:" + ip, 10);
    const body = await readBody(request);
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length > 256) throw new ApiError(400, "Password too long");
    const [salt, expected] = passwordHash.split(":");
    const actual = await promisify(scrypt)(password, salt, 64);
    if (!timingSafeEqual(actual, Buffer.from(expected, "hex")))
      throw new ApiError(401, "Incorrect password");
    const token = randomBytes(32).toString("hex");
    sessions.set(hash(token), Date.now() + ttl);
    return json({ ok: true }, 200, { "Set-Cookie": cookie(token, ttl / 1000) });
  }
  if (
    path === "/api/admin" ||
    path === "/api/logout" ||
    path === "/api/session"
  ) {
    const token =
      request.headers
        .get("cookie")
        ?.match(/(?:^|; )gs_session=([a-f0-9]{64})(?:;|$)/)?.[1] ?? "";
    const key = hash(token);
    if ((sessions.get(key) ?? 0) <= Date.now())
      throw new ApiError(401, "Sign in required");
    if (request.method === "POST") sameOrigin(request);
    if (path === "/api/logout") {
      if (request.method !== "POST") throw new ApiError(405, "Use POST");
      sessions.delete(key);
      return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
    }
    if (path === "/api/session") return json({ workspace: owner });
    limit("admin:" + key, 120);
    return json(
      request.method === "GET"
        ? await adminRead(db, owner, url.searchParams.get("employee"))
        : await adminWrite(db, owner, await readBody(request)),
    );
  }
  if (path === "/api/device" || path === "/api/admin-mobile") {
    limit("ip:" + ip, 600);
    const auth = request.headers.get("authorization");
    if (!auth || auth.length > 128)
      throw new ApiError(401, "Access key required");
    limit("key:" + hash(auth), 120);
    if (path === "/api/admin-mobile") {
      const admin = await adminIdentity(db, auth);
      const result =
        request.method === "GET"
          ? await adminRead(db, admin.owner, url.searchParams.get("employee"))
          : await mobileAdminWrite(db, admin, await readBody(request));
      return json({
        ...result,
        access: { label: admin.label, role: admin.role },
      });
    }
    const employee = await deviceIdentity(db, auth);
    return json(
      request.method === "GET"
        ? await deviceRead(db, employee)
        : await deviceWrite(db, employee, await readBody(request)),
    );
  }
  if (path.startsWith("/api/")) throw new ApiError(404, "Not found");
  if (request.method !== "GET") throw new ApiError(405, "Use GET");
  const file = resolve(root, "." + decodeURIComponent(path));
  if (file !== root && !file.startsWith(root + sep))
    throw new ApiError(404, "Not found");
  let target = file;
  try {
    if (!(await stat(target)).isFile()) target = resolve(root, "index.html");
  } catch {
    if (extname(path)) throw new ApiError(404, "Not found");
    target = resolve(root, "index.html");
  }
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
  };
  return new Response(await readFile(target), {
    headers: {
      "Content-Type": types[extname(target)] ?? "application/octet-stream",
      "Cache-Control":
        extname(target) === ".html" ? "no-store" : "public, max-age=3600",
    },
  });
}
const server = createServer(async (req, res) => {
  try {
    const forwarded = process.env.TRUST_PROXY === "true";
    const origin = process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65000) throw new ApiError(413, "Request too large");
      chunks.push(chunk);
    }
    const request = new Request(new URL(req.url, origin), {
      method: req.method,
      headers: req.headers,
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
    });
    const ip = forwarded
      ? String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress)
          .split(",")
          .at(-1)
          .trim()
      : req.socket.remoteAddress;
    const response = await handle(request, ip);
    res.writeHead(response.status, {
      ...Object.fromEntries(response.headers),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const response = failure(error);
    res.writeHead(response.status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(await response.text());
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.listen(
  Number(process.env.PORT ?? 8080),
  process.env.HOST ?? "127.0.0.1",
  () => console.log("GroSuite server ready"),
);
const maintenance = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (v < now) sessions.delete(k);
  for (const [k, v] of limits) if (v.until < now) limits.delete(k);
  const days = Number(process.env.LOCATION_RETENTION_DAYS ?? 30);
  if (!Number.isInteger(days) || days < 7 || days > 365) return;
  const cutoff = now - days * 86400000;
  sqlite
    .prepare(
      "DELETE FROM points WHERE id IN (SELECT id FROM points WHERE captured<? LIMIT 10000)",
    )
    .run(cutoff);
  sqlite
    .prepare(
      "UPDATE employees SET lat=NULL,lng=NULL,accuracy=NULL,battery=NULL,last_seen=NULL WHERE last_seen<?",
    )
    .run(cutoff);
}, 60000).unref();
process.on("SIGTERM", () => {
  clearInterval(maintenance);
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
});
