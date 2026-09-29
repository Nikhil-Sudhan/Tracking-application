import { z } from "zod";
export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}
const id = z.string().min(1).max(100),
  uuid = z.string().uuid(),
  text = (n: number) => z.string().trim().min(1).max(n);
const employeeFields =
  "id,name,email,team,color,lat,lng,accuracy,battery,last_seen AS lastSeen,shift_start AS shiftStart,device";
export const employeeInput = z.object({
  name: text(100),
  email: z.string().email().max(160),
  team: text(60),
});
const taskInput = z.object({
  employeeId: id,
  title: text(160),
  address: text(300),
  due: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => !Number.isNaN(Date.parse(s))),
});
const taskState = z.enum(["Assigned", "In progress", "Completed"]);
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export async function digest(value: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function owned(db: D1Database, owner: string, employeeId: string) {
  const e = await db
    .prepare("SELECT id FROM employees WHERE id=? AND owner=?")
    .bind(employeeId, owner)
    .first();
  if (!e) throw new ApiError(404, "Employee not found");
}
export async function adminRead(
  db: D1Database,
  owner: string,
  employeeId?: string | null,
) {
  if (employeeId) {
    await owned(db, owner, employeeId);
    const { results } = await db
      .prepare(
        "SELECT id,employee_id AS employeeId,shift_id AS shiftId,lat,lng,accuracy,captured,battery FROM points WHERE employee_id=? AND captured>=? ORDER BY captured LIMIT 5000",
      )
      .bind(employeeId, Date.now() - 86400000)
      .all();
    return { points: results };
  }
  const [employees, tasks, shifts, geofences, leaves, audit, adminDevices] =
    await db.batch([
      db
        .prepare(
          `SELECT ${employeeFields} FROM employees WHERE owner=? ORDER BY name`,
        )
        .bind(owner),
      db
        .prepare(
          "SELECT t.id,t.employee_id AS employeeId,t.title,t.address,t.due,t.status FROM tasks t JOIN employees e ON e.id=t.employee_id WHERE e.owner=? ORDER BY t.due DESC LIMIT 1000",
        )
        .bind(owner),
      db
        .prepare(
          "SELECT s.id,s.employee_id AS employeeId,s.started,s.ended,s.site_name AS siteName,s.checkin_accuracy AS checkinAccuracy FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE e.owner=? ORDER BY s.started DESC LIMIT 1000",
        )
        .bind(owner),
      db
        .prepare(
          "SELECT id,name,team,lat,lng,radius,active FROM geofences WHERE owner=? ORDER BY name",
        )
        .bind(owner),
      db
        .prepare(
          "SELECT l.id,l.employee_id AS employeeId,l.start_date AS startDate,l.end_date AS endDate,l.kind,l.reason,l.status,l.review_note AS reviewNote,l.created FROM leave_requests l JOIN employees e ON e.id=l.employee_id WHERE e.owner=? ORDER BY l.created DESC LIMIT 500",
        )
        .bind(owner),
      db
        .prepare(
          "SELECT id,actor,action,subject,created FROM audit_events WHERE owner=? ORDER BY created DESC LIMIT 200",
        )
        .bind(owner),
      db
        .prepare(
          "SELECT id,label,role,expires,revoked FROM admin_devices WHERE owner=? ORDER BY created DESC LIMIT 100",
        )
        .bind(owner),
    ]);
  return {
    employees: employees.results,
    tasks: tasks.results,
    shifts: shifts.results,
    geofences: geofences.results,
    leaves: leaves.results,
    audit: audit.results,
    adminDevices: adminDevices.results,
  };
}
async function writeAdmin(
  db: D1Database,
  owner: string,
  body: Record<string, unknown>,
) {
  if (body.action === "geofence") {
    const site = z
      .object({
        name: text(100),
        team: z.string().trim().max(60).default(""),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radius: z.number().int().min(50).max(10000),
      })
      .parse(body);
    const siteId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO geofences (id,owner,name,team,lat,lng,radius,created) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        siteId,
        owner,
        site.name,
        site.team,
        site.lat,
        site.lng,
        site.radius,
        Date.now(),
      )
      .run();
    return { id: siteId };
  }
  if (body.action === "geofence-toggle") {
    const r = await db
      .prepare("UPDATE geofences SET active=? WHERE id=? AND owner=?")
      .bind(z.boolean().parse(body.active) ? 1 : 0, id.parse(body.id), owner)
      .run();
    if (!r.meta.changes) throw new ApiError(404, "Site not found");
    return { ok: true };
  }
  if (body.action === "leave-review") {
    const r = await db
      .prepare(
        "UPDATE leave_requests SET status=?,review_note=?,reviewed=? WHERE id=? AND status='Pending' AND employee_id IN (SELECT id FROM employees WHERE owner=?)",
      )
      .bind(
        z.enum(["Approved", "Declined"]).parse(body.status),
        z
          .string()
          .trim()
          .max(500)
          .parse(body.note ?? ""),
        Date.now(),
        id.parse(body.id),
        owner,
      )
      .run();
    if (!r.meta.changes)
      throw new ApiError(409, "Request was already reviewed or is unavailable");
    return { ok: true };
  }
  if (body.action === "admin-pair") {
    const label = text(80).parse(body.label),
      role = z.enum(["viewer", "manager"]).parse(body.role);
    const token =
      "ga_" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const deviceId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO admin_devices (id,owner,label,token_hash,role,expires,created) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        deviceId,
        owner,
        label,
        await digest(token),
        role,
        Date.now() + 30 * 86400000,
        Date.now(),
      )
      .run();
    return { id: deviceId, token };
  }
  if (body.action === "admin-revoke") {
    const r = await db
      .prepare("UPDATE admin_devices SET revoked=? WHERE id=? AND owner=?")
      .bind(Date.now(), id.parse(body.id), owner)
      .run();
    if (!r.meta.changes) throw new ApiError(404, "Admin device not found");
    return { ok: true };
  }
  if (body.action === "employee") {
    const e = employeeInput.parse(body);
    const employeeId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO employees (id,owner,name,email,team,color) VALUES (?,?,?,?,?,?)",
      )
      .bind(employeeId, owner, e.name, e.email, e.team, "#567f85")
      .run();
    return { id: employeeId };
  }
  if (body.action === "task") {
    const t = taskInput.parse(body);
    await owned(db, owner, t.employeeId);
    const taskId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO tasks (id,employee_id,title,address,due,status) VALUES (?,?,?,?,?,?)",
      )
      .bind(taskId, t.employeeId, t.title, t.address, t.due, "Assigned")
      .run();
    return { id: taskId };
  }
  if (body.action === "task-status") {
    const taskId = id.parse(body.id),
      state = taskState.parse(body.status);
    const r = await db
      .prepare(
        "UPDATE tasks SET status=? WHERE id=? AND employee_id IN (SELECT id FROM employees WHERE owner=?)",
      )
      .bind(state, taskId, owner)
      .run();
    if (!r.meta.changes) throw new ApiError(404, "Task not found");
    return { ok: true };
  }
  if (body.action === "pair" || body.action === "revoke") {
    const employeeId = id.parse(body.id);
    await owned(db, owner, employeeId);
    const token =
      body.action === "pair"
        ? "fp_" +
          Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
        : null;
    await db.batch([
      db
        .prepare(
          "UPDATE employees SET token_hash=?,shift_start=NULL,device=NULL WHERE id=? AND owner=?",
        )
        .bind(token ? await digest(token) : null, employeeId, owner),
      db
        .prepare(
          "UPDATE shifts SET ended=? WHERE employee_id=? AND ended IS NULL",
        )
        .bind(Date.now(), employeeId),
    ]);
    return token ? { token } : { ok: true };
  }
  throw new ApiError(400, "Unknown action");
}
export async function adminWrite(
  db: D1Database,
  owner: string,
  body: Record<string, unknown>,
  actor = "Workspace admin",
) {
  const result = await writeAdmin(db, owner, body);
  await auditEvent(
    db,
    owner,
    actor,
    String(body.action),
    String(
      body.name ??
        body.title ??
        body.label ??
        body.id ??
        ("id" in result ? result.id : ""),
    ),
  );
  return result;
}
async function auditEvent(
  db: D1Database,
  owner: string,
  actor: string,
  action: string,
  subject: string,
) {
  await db
    .prepare(
      "INSERT INTO audit_events (id,owner,actor,action,subject,created) VALUES (?,?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), owner, actor, action, subject, Date.now())
    .run();
}
export async function adminIdentity(
  db: D1Database,
  authorization: string | null,
) {
  const token = authorization?.replace(/^Bearer /, "") ?? "";
  if (!/^ga_[a-f0-9]{64}$/.test(token))
    throw new ApiError(401, "Connect with a valid admin access key");
  const admin = await db
    .prepare(
      "SELECT id,owner,label,role FROM admin_devices WHERE token_hash=? AND revoked IS NULL AND expires>?",
    )
    .bind(await digest(token), Date.now())
    .first<{ id: string; owner: string; label: string; role: string }>();
  if (!admin) throw new ApiError(401, "Admin access expired or was revoked");
  return admin;
}
export async function mobileAdminWrite(
  db: D1Database,
  admin: Awaited<ReturnType<typeof adminIdentity>>,
  body: Record<string, unknown>,
) {
  if (
    admin.role !== "manager" ||
    ["admin-pair", "admin-revoke"].includes(String(body.action))
  )
    throw new ApiError(403, "This action requires workspace owner access");
  return adminWrite(db, admin.owner, body, admin.label);
}
type DeviceEmployee = {
  id: string;
  name: string;
  shiftStart: number | null;
  owner: string;
  team: string;
};
export async function deviceIdentity(
  db: D1Database,
  authorization: string | null,
): Promise<DeviceEmployee> {
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!/^fp_[a-f0-9]{64}$/.test(token))
    throw new ApiError(401, "Pair this device with a valid employee key.");
  const e = await db
    .prepare(
      "SELECT id,name,owner,team,shift_start AS shiftStart FROM employees WHERE token_hash=?",
    )
    .bind(await digest(token))
    .first<DeviceEmployee>();
  if (!e) throw new ApiError(401, "Device access has expired or was revoked.");
  return e;
}
export async function deviceRead(db: D1Database, e: DeviceEmployee) {
  const [shifts, sites, history, leaves, tasks] = await db.batch([
    db
      .prepare(
        "SELECT id,started,ended FROM shifts WHERE employee_id=? AND ended IS NULL",
      )
      .bind(e.id),
    db
      .prepare(
        "SELECT id,name,lat,lng,radius FROM geofences WHERE owner=? AND active=1 AND (team='' OR team=?) ORDER BY name",
      )
      .bind(e.owner, e.team),
    db
      .prepare(
        "SELECT id,started,ended,site_name AS siteName FROM shifts WHERE employee_id=? ORDER BY started DESC LIMIT 60",
      )
      .bind(e.id),
    db
      .prepare(
        "SELECT id,start_date AS startDate,end_date AS endDate,kind,reason,status,review_note AS reviewNote FROM leave_requests WHERE employee_id=? ORDER BY created DESC LIMIT 100",
      )
      .bind(e.id),
    db
      .prepare(
        "SELECT id,employee_id AS employeeId,title,address,due,status FROM tasks WHERE employee_id=? ORDER BY due DESC LIMIT 200",
      )
      .bind(e.id),
  ]);
  return {
    employee: { id: e.id, name: e.name },
    shift: shifts.results[0] ?? null,
    tasks: tasks.results,
    sites: sites.results,
    history: history.results,
    leaves: leaves.results,
  };
}
export async function deviceWrite(
  db: D1Database,
  e: DeviceEmployee,
  body: Record<string, unknown>,
) {
  const now = Date.now();
  if (body.action === "leave") {
    const date = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (s) =>
          !Number.isNaN(Date.parse(s)) &&
          new Date(s).toISOString().slice(0, 10) === s,
      );
    const input = z
      .object({
        startDate: date,
        endDate: date,
        kind: z.enum(["Annual", "Sick", "Personal"]),
        reason: text(500),
      })
      .parse(body);
    if (
      input.endDate < input.startDate ||
      Date.parse(input.endDate) - Date.parse(input.startDate) > 90 * 86400000
    )
      throw new ApiError(400, "Choose a valid leave period of up to 90 days");
    const existing = await db
      .prepare(
        "SELECT id FROM leave_requests WHERE employee_id=? AND status IN ('Pending','Approved') AND start_date<=? AND end_date>=?",
      )
      .bind(e.id, input.endDate, input.startDate)
      .first();
    if (existing)
      throw new ApiError(409, "A leave request already covers these dates");
    const leaveId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO leave_requests (id,employee_id,start_date,end_date,kind,reason,created) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        leaveId,
        e.id,
        input.startDate,
        input.endDate,
        input.kind,
        input.reason,
        now,
      )
      .run();
    await auditEvent(
      db,
      e.owner,
      e.name,
      "leave-request",
      input.startDate + " to " + input.endDate,
    );
    return { id: leaveId };
  }
  if (body.action === "start") {
    const shiftId = uuid.parse(body.shiftId),
      device = z.enum(["Android", "iOS"]).parse(body.device);
    const existing = await db
      .prepare(
        "SELECT id,started FROM shifts WHERE employee_id=? AND ended IS NULL",
      )
      .bind(e.id)
      .first();
    if (existing) return { shift: existing };
    const { results: sites } = await db
      .prepare(
        "SELECT name,lat,lng,radius FROM geofences WHERE owner=? AND active=1 AND (team='' OR team=?)",
      )
      .bind(e.owner, e.team)
      .all<{ name: string; lat: number; lng: number; radius: number }>();
    let proof:
      | {
          lat: number;
          lng: number;
          accuracy: number;
          captured: number;
          mocked?: boolean;
        }
      | undefined;
    let siteName: string | null = null;
    if (sites.length) {
      if (!body.location)
        throw new ApiError(
          400,
          "A fresh location is required to clock in at your assigned site",
        );
      const fix = z
        .object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          accuracy: z.number().min(0).max(100),
          captured: z
            .number()
            .min(now - 60000)
            .max(now + 10000),
          mocked: z
            .boolean()
            .optional()
            .refine((v) => !v, "Mock locations are not accepted"),
        })
        .safeParse(body.location);
      if (!fix.success) throw new ApiError(400, "Could not verify your GPS location. Turn on precise location, move outdoors, and try again. Your fix must be less than a minute old and accurate to 100 metres or better.");
      proof = fix.data;
      const match = sites.find(
        (s) =>
          distanceMeters(proof!.lat, proof!.lng, s.lat, s.lng) +
            proof!.accuracy <=
          s.radius,
      );
      if (!match)
        throw new ApiError(
          403,
          "You are outside your assigned attendance sites, or GPS accuracy is too low. Move inside the site and retry.",
        );
      siteName = match.name;
    }
    await db.batch([
      db
        .prepare(
          "INSERT INTO shifts (id,employee_id,started,site_name,checkin_lat,checkin_lng,checkin_accuracy) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE employee_id=? AND ended IS NULL) ON CONFLICT DO NOTHING",
        )
        .bind(
          shiftId,
          e.id,
          now,
          siteName,
          proof?.lat ?? null,
          proof?.lng ?? null,
          proof?.accuracy ?? null,
          e.id,
        ),
      db
        .prepare(
          "UPDATE employees SET shift_start=(SELECT started FROM shifts WHERE employee_id=? AND ended IS NULL),device=? WHERE id=?",
        )
        .bind(e.id, device, e.id),
    ]);
    const shift = await db
      .prepare(
        "SELECT id,started FROM shifts WHERE employee_id=? AND ended IS NULL",
      )
      .bind(e.id)
      .first();
    if (!shift)
      throw new ApiError(409, "Shift could not start. Use a new shift ID.");
    await auditEvent(
      db,
      e.owner,
      e.name,
      "clock-in",
      siteName ?? "Field shift",
    );
    return { shift };
  }
  if (body.action === "stop") {
    const shiftId = uuid.parse(body.shiftId);
    const s = await db
      .prepare("SELECT started,ended FROM shifts WHERE id=? AND employee_id=?")
      .bind(shiftId, e.id)
      .first<{ started: number; ended: number | null }>();
    if (!s) throw new ApiError(404, "Shift not found");
    const ended = z
      .number()
      .int()
      .min(s.started)
      .max(now + 30000)
      .parse(body.ended);
    const effective = Math.min(now, ended);
    await db.batch([
      db
        .prepare(
          "UPDATE shifts SET ended=? WHERE id=? AND employee_id=? AND ended IS NULL",
        )
        .bind(effective, shiftId, e.id),
      db
        .prepare(
          "UPDATE employees SET shift_start=NULL WHERE id=? AND shift_start=?",
        )
        .bind(e.id, s.started),
    ]);
    return { ok: true };
  }
  if (body.action === "locations") {
    const input = z
      .object({
        shiftId: uuid,
        points: z
          .array(
            z.object({
              id: uuid,
              lat: z.number().min(-90).max(90),
              lng: z.number().min(-180).max(180),
              accuracy: z.number().min(0).max(100000),
              captured: z
                .number()
                .int()
                .min(0)
                .max(now + 30000),
              battery: z.number().int().min(0).max(100).nullable(),
              mocked: z
                .boolean()
                .optional()
                .refine((v) => !v, "Mock locations are not accepted"),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(body);
    const s = await db
      .prepare("SELECT started,ended FROM shifts WHERE id=? AND employee_id=?")
      .bind(input.shiftId, e.id)
      .first<{ started: number; ended: number | null }>();
    if (!s) throw new ApiError(404, "Shift not found");
    const accepted = input.points.filter(
      (p) =>
        p.captured >= s.started &&
        p.captured <= (s.ended ?? now + 30000) &&
        p.captured >= now - 7 * 86400000,
    );
    const acceptedIds = new Set(accepted.map((p) => p.id));
    const rejected = input.points
      .filter((p) => !acceptedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        reason: p.captured < now - 7 * 86400000 ? "expired" : "outside-shift",
      }));
    if (!accepted.length) return { accepted: [], rejected };
    const latest = accepted.reduce((a, b) => (a.captured > b.captured ? a : b));
    await db.batch([
      ...accepted.map((p) =>
        db
          .prepare(
            "INSERT INTO points (id,employee_id,shift_id,lat,lng,accuracy,captured,battery) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
          )
          .bind(
            p.id,
            e.id,
            input.shiftId,
            p.lat,
            p.lng,
            p.accuracy,
            p.captured,
            p.battery,
          ),
      ),
      db
        .prepare(
          "UPDATE employees SET lat=?,lng=?,accuracy=?,battery=?,last_seen=? WHERE id=? AND shift_start=? AND (last_seen IS NULL OR last_seen<?)",
        )
        .bind(
          latest.lat,
          latest.lng,
          latest.accuracy,
          latest.battery,
          latest.captured,
          e.id,
          s.started,
          latest.captured,
        ),
    ]);
    return { accepted: accepted.map((p) => p.id), rejected };
  }
  if (body.action === "task-status") {
    const taskId = id.parse(body.id),
      state = taskState.parse(body.status);
    const r = await db
      .prepare("UPDATE tasks SET status=? WHERE id=? AND employee_id=?")
      .bind(state, taskId, e.id)
      .run();
    if (!r.meta.changes) throw new ApiError(404, "Task not found");
    return { ok: true };
  }
  throw new ApiError(400, "Unknown action");
}
export async function readBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 65000)
    throw new ApiError(413, "Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Request body required");
  const decoder = new TextDecoder();
  let raw = "",
    size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65000) {
        await reader.cancel();
        throw new ApiError(413, "Request too large");
      }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return z.record(z.unknown()).parse(JSON.parse(raw));
  } catch {
    throw new ApiError(400, "Invalid JSON request");
  }
}
export function failure(e: unknown) {
  if (e instanceof ApiError)
    return Response.json({ error: e.message }, { status: e.code });
  if (e instanceof z.ZodError)
    return Response.json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  console.error(
    "Tracking API failure",
    e instanceof Error ? e.message : "unknown",
  );
  return Response.json(
    { error: "Service unavailable. Please retry." },
    { status: 503 },
  );
}
