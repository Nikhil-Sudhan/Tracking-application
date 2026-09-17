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
  const [employees, tasks, shifts] = await db.batch([
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
        "SELECT s.id,s.employee_id AS employeeId,s.started,s.ended FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE e.owner=? ORDER BY s.started DESC LIMIT 200",
      )
      .bind(owner),
  ]);
  return {
    employees: employees.results,
    tasks: tasks.results,
    shifts: shifts.results,
  };
}
export async function adminWrite(
  db: D1Database,
  owner: string,
  body: Record<string, unknown>,
) {
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
type DeviceEmployee = { id: string; name: string; shiftStart: number | null };
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
      "SELECT id,name,shift_start AS shiftStart FROM employees WHERE token_hash=?",
    )
    .bind(await digest(token))
    .first<DeviceEmployee>();
  if (!e) throw new ApiError(401, "Device access has expired or was revoked.");
  return e;
}
export async function deviceRead(db: D1Database, e: DeviceEmployee) {
  const [shifts, tasks] = await db.batch([
    db
      .prepare(
        "SELECT id,started,ended FROM shifts WHERE employee_id=? AND ended IS NULL",
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
  };
}
export async function deviceWrite(
  db: D1Database,
  e: DeviceEmployee,
  body: Record<string, unknown>,
) {
  const now = Date.now();
  if (body.action === "start") {
    const shiftId = uuid.parse(body.shiftId),
      device = z.enum(["Android", "iOS"]).parse(body.device);
    await db.batch([
      db
        .prepare(
          "INSERT INTO shifts (id,employee_id,started) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE employee_id=? AND ended IS NULL) ON CONFLICT DO NOTHING",
        )
        .bind(shiftId, e.id, now, e.id),
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
