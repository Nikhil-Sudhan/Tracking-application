import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {
  adminRead,
  adminWrite,
  deviceIdentity,
  deviceRead,
  deviceWrite,
  readBody,
} from "../lib/tracking-service.ts";
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(
      readFileSync(new URL("../drizzle/" + f, import.meta.url), "utf8"),
    );
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...v) {
          args = v;
          return this;
        },
        async first() {
          return statement.get(...args) ?? null;
        },
        async all() {
          return { results: statement.all(...args) };
        },
        async run() {
          return { meta: { changes: statement.run(...args).changes } };
        },
        execute() {
          if (statement.columns().length)
            return { results: statement.all(...args) };
          return {
            meta: { changes: statement.run(...args).changes },
            results: [],
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const r = statements.map((s) => s.execute());
        sqlite.exec("COMMIT");
        return r;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db, sqlite };
}
async function employee(db, owner = "owner-a", name = "Employee A") {
  const r = await adminWrite(db, owner, {
    action: "employee",
    name,
    email: "a@example.com",
    team: "Sales",
  });
  const pair = await adminWrite(db, owner, { action: "pair", id: r.id });
  const identity = await deviceIdentity(db, "Bearer " + pair.token);
  return { id: r.id, token: pair.token, identity };
}
test("workspace isolation applies to employees, route history, tasks and device keys", async () => {
  const { db } = database();
  const a = await employee(db);
  assert.equal((await adminRead(db, "owner-b")).employees.length, 0);
  for (const action of ["pair", "revoke"])
    await assert.rejects(adminWrite(db, "owner-b", { action, id: a.id }), {
      code: 404,
    });
  await assert.rejects(adminRead(db, "owner-b", a.id), { code: 404 });
  await assert.rejects(
    adminWrite(db, "owner-b", {
      action: "task",
      employeeId: a.id,
      title: "Visit",
      address: "Site",
      due: "2026-09-17",
    }),
    { code: 404 },
  );
});
test("device keys are hashed, rotation invalidates old key and revocation ends shift", async () => {
  const { db, sqlite } = database();
  const a = await employee(db);
  assert.notEqual(
    sqlite.prepare("SELECT token_hash FROM employees").get().token_hash,
    a.token,
  );
  const shift = await deviceWrite(db, a.identity, {
    action: "start",
    shiftId: crypto.randomUUID(),
    device: "Android",
  });
  await adminWrite(db, "owner-a", { action: "pair", id: a.id });
  await assert.rejects(deviceIdentity(db, "Bearer " + a.token), { code: 401 });
  assert.ok(
    sqlite.prepare("SELECT ended FROM shifts WHERE id=?").get(shift.shift.id)
      .ended,
  );
  const next = await adminWrite(db, "owner-a", { action: "pair", id: a.id });
  await adminWrite(db, "owner-a", { action: "revoke", id: a.id });
  await assert.rejects(deviceIdentity(db, "Bearer " + next.token), {
    code: 401,
  });
});
test("clock-in is idempotent and database enforces one active shift", async () => {
  const { db, sqlite } = database();
  const a = await employee(db);
  const shiftId = crypto.randomUUID();
  const one = await deviceWrite(db, a.identity, {
    action: "start",
    shiftId,
    device: "iOS",
  });
  const two = await deviceWrite(db, a.identity, {
    action: "start",
    shiftId,
    device: "iOS",
  });
  const three = await deviceWrite(db, a.identity, {
    action: "start",
    shiftId: crypto.randomUUID(),
    device: "iOS",
  });
  assert.equal(one.shift.id, two.shift.id);
  assert.equal(one.shift.id, three.shift.id);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM shifts").get().n, 1);
  assert.throws(() =>
    sqlite
      .prepare("INSERT INTO shifts (id,employee_id,started) VALUES (?,?,?)")
      .run(crypto.randomUUID(), a.id, Date.now()),
  );
});
test("location retries do not duplicate points and stale uploads cannot overwrite latest fix", async () => {
  const { db, sqlite } = database();
  const a = await employee(db);
  const { shift } = await deviceWrite(db, a.identity, {
    action: "start",
    shiftId: crypto.randomUUID(),
    device: "Android",
  });
  const p = {
    id: crypto.randomUUID(),
    lat: 12.95,
    lng: 77.61,
    accuracy: 10,
    captured: shift.started + 2,
    battery: 81,
  };
  for (let i = 0; i < 2; i++)
    await deviceWrite(db, a.identity, {
      action: "locations",
      shiftId: shift.id,
      points: [p],
    });
  await deviceWrite(db, a.identity, {
    action: "locations",
    shiftId: shift.id,
    points: [
      { ...p, id: crypto.randomUUID(), captured: shift.started, lat: 13 },
    ],
  });
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM points").get().n, 2);
  assert.equal(sqlite.prepare("SELECT lat FROM employees").get().lat, 12.95);
});
test("off-duty, foreign-shift, mocked and invalid coordinates are rejected", async () => {
  const { db } = database();
  const a = await employee(db),
    b = await employee(db, "owner-b");
  const { shift } = await deviceWrite(db, a.identity, {
    action: "start",
    shiftId: crypto.randomUUID(),
    device: "Android",
  });
  const p = {
    id: crypto.randomUUID(),
    lat: 12,
    lng: 77,
    accuracy: 10,
    captured: shift.started,
    battery: 81,
  };
  await assert.rejects(
    deviceWrite(db, b.identity, {
      action: "locations",
      shiftId: shift.id,
      points: [p],
    }),
    { code: 404 },
  );
  await assert.rejects(
    deviceWrite(db, a.identity, {
      action: "locations",
      shiftId: shift.id,
      points: [{ ...p, lat: 91 }],
    }),
  );
  await assert.rejects(
    deviceWrite(db, a.identity, {
      action: "locations",
      shiftId: shift.id,
      points: [{ ...p, mocked: true }],
    }),
  );
  await deviceWrite(db, a.identity, {
    action: "stop",
    shiftId: shift.id,
    ended: shift.started,
  });
  const result = await deviceWrite(db, a.identity, {
    action: "locations",
    shiftId: shift.id,
    points: [{ ...p, captured: shift.started + 1 }],
  });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, "outside-shift");
  await deviceWrite(db, a.identity, {
    action: "locations",
    shiftId: shift.id,
    points: [p],
  });
});
test("employee may only read or complete their own tasks", async () => {
  const { db } = database();
  const a = await employee(db),
    b = await employee(db);
  const t = await adminWrite(db, "owner-a", {
    action: "task",
    employeeId: a.id,
    title: "Visit customer",
    address: "Bengaluru",
    due: "2026-09-17",
  });
  assert.equal((await deviceRead(db, b.identity)).tasks.length, 0);
  await assert.rejects(
    deviceWrite(db, b.identity, {
      action: "task-status",
      id: t.id,
      status: "Completed",
    }),
    { code: 404 },
  );
  await deviceWrite(db, a.identity, {
    action: "task-status",
    id: t.id,
    status: "Completed",
  });
  assert.equal((await deviceRead(db, a.identity)).tasks[0].status, "Completed");
  await assert.rejects(
    adminWrite(db, "owner-b", {
      action: "task-status",
      id: t.id,
      status: "Assigned",
    }),
    { code: 404 },
  );
});
test("request parser rejects malformed JSON and oversized payloads", async () => {
  await assert.rejects(
    readBody(new Request("https://test", { method: "POST", body: "not json" })),
    { code: 400 },
  );
  await assert.rejects(
    readBody(
      new Request("https://test", { method: "POST", body: "a".repeat(65001) }),
    ),
    { code: 413 },
  );
});
