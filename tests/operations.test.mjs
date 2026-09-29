import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../backend/sqlite.mjs";
import {
  adminWrite,
  adminRead,
  adminIdentity,
  mobileAdminWrite,
  deviceIdentity,
  deviceRead,
  deviceWrite,
  distanceMeters,
} from "../lib/tracking-service.ts";
async function setup(owner = "workspace-a") {
  const { db, sqlite } = openDatabase(":memory:");
  const { id } = await adminWrite(db, owner, {
    action: "employee",
    name: "Test employee",
    email: "test@example.com",
    team: "Sales",
  });
  const { token } = await adminWrite(db, owner, { action: "pair", id });
  return {
    db,
    sqlite,
    employee: await deviceIdentity(db, "Bearer " + token),
    id,
    owner,
  };
}
const start = (location) => ({
  action: "start",
  shiftId: crypto.randomUUID(),
  device: "Android",
  ...(location ? { location } : {}),
});
const location = () => ({
  lat: 12.9716,
  lng: 77.5946,
  accuracy: 10,
  captured: Date.now(),
  mocked: false,
});
test("geofence attendance fails closed for outside, uncertain, stale, mocked and missing GPS", async () => {
  const { db, employee, sqlite } = await setup();
  await adminWrite(db, "workspace-a", {
    action: "geofence",
    name: "Office",
    team: "Sales",
    lat: 12.9716,
    lng: 77.5946,
    radius: 100,
  });
  for (const point of [
    undefined,
    { ...location(), lat: 13 },
    { ...location(), accuracy: 101 },
    { ...location(), captured: Date.now() - 61000 },
    { ...location(), mocked: true },
  ])
    await assert.rejects(deviceWrite(db, employee, start(point)));
  assert.equal(sqlite.prepare("SELECT count(*) n FROM shifts").get().n, 0);
  const { shift } = await deviceWrite(db, employee, start(location()));
  assert.equal(
    sqlite.prepare("SELECT site_name FROM shifts WHERE id=?").get(shift.id)
      .site_name,
    "Office",
  );
  assert.equal((await deviceRead(db, employee)).sites[0].name, "Office");
  assert.equal((await deviceRead(db, employee)).history[0].siteName, "Office");
  assert.equal((await deviceRead(db, employee)).tasks.length, 0);
  // Existing work can be recovered without forcing the employee back to the site.
  assert.equal((await deviceWrite(db, employee, start())).shift.id, shift.id);
  await deviceWrite(db, employee, {
    action: "stop",
    shiftId: shift.id,
    ended: Date.now(),
  });
  assert.ok(
    sqlite.prepare("SELECT ended FROM shifts WHERE id=?").get(shift.id).ended,
  );
});
test("GPS uncertainty cannot extend the permitted boundary; team and owner policies remain isolated", async () => {
  const { db, employee } = await setup();
  assert.ok(distanceMeters(0, 0, 0, 1) > 111000);
  await adminWrite(db, "workspace-b", {
    action: "geofence",
    name: "Other company",
    team: "",
    lat: 0,
    lng: 0,
    radius: 100,
  });
  await adminWrite(db, "workspace-a", {
    action: "geofence",
    name: "Other team",
    team: "Support",
    lat: 0,
    lng: 0,
    radius: 100,
  });
  assert.equal((await deviceRead(db, employee)).sites.length, 0);
  const site = await adminWrite(db, "workspace-a", {
    action: "geofence",
    name: "All teams",
    team: "",
    lat: 12.9716,
    lng: 77.5946,
    radius: 100,
  });
  await assert.rejects(
    deviceWrite(
      db,
      employee,
      start({ ...location(), lat: 12.97232, accuracy: 30 }),
    ),
    { code: 403 },
  );
  await assert.rejects(
    adminWrite(db, "workspace-b", {
      action: "geofence-toggle",
      id: site.id,
      active: false,
    }),
    { code: 404 },
  );
  await adminWrite(db, "workspace-a", {
    action: "geofence-toggle",
    id: site.id,
    active: false,
  });
  assert.ok((await deviceWrite(db, employee, start())).shift);
});
test("admin phone keys are hashed, scoped, expire, revoke and enforce read-only access", async () => {
  const { db, sqlite } = await setup();
  const pair = await adminWrite(db, "workspace-a", {
    action: "admin-pair",
    label: "Manager phone",
    role: "manager",
  });
  const manager = await adminIdentity(db, "Bearer " + pair.token);
  assert.notEqual(
    sqlite.prepare("SELECT token_hash FROM admin_devices").get().token_hash,
    pair.token,
  );
  await assert.rejects(
    mobileAdminWrite(db, manager, {
      action: "admin-pair",
      label: "Escalate",
      role: "manager",
    }),
    { code: 403 },
  );
  const viewerKey = await adminWrite(db, "workspace-b", {
    action: "admin-pair",
    label: "Viewer",
    role: "viewer",
  });
  const viewer = await adminIdentity(db, "Bearer " + viewerKey.token);
  assert.equal((await adminRead(db, viewer.owner)).employees.length, 0);
  await assert.rejects(
    mobileAdminWrite(db, viewer, {
      action: "employee",
      name: "No",
      email: "no@example.com",
      team: "Sales",
    }),
    { code: 403 },
  );
  await adminWrite(db, "workspace-a", { action: "admin-revoke", id: pair.id });
  await assert.rejects(adminIdentity(db, "Bearer " + pair.token), {
    code: 401,
  });
  sqlite
    .prepare("UPDATE admin_devices SET expires=0 WHERE id=?")
    .run(viewer.id);
  await assert.rejects(adminIdentity(db, "Bearer " + viewerKey.token), {
    code: 401,
  });
});
test("leave requests validate calendar dates, prevent overlap and can only be reviewed once by the workspace", async () => {
  const { db, employee } = await setup();
  const request = {
    action: "leave",
    kind: "Annual",
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    reason: "Family trip",
  };
  await assert.rejects(
    deviceWrite(db, employee, {
      ...request,
      startDate: "2026-02-30",
      endDate: "2026-03-02",
    }),
  );
  await assert.rejects(
    deviceWrite(db, employee, { ...request, endDate: "2026-09-30" }),
  );
  const result = await deviceWrite(db, employee, request);
  await assert.rejects(
    deviceWrite(db, employee, { ...request, startDate: "2026-10-02" }),
    { code: 409 },
  );
  await assert.rejects(
    adminWrite(db, "workspace-b", {
      action: "leave-review",
      id: result.id,
      status: "Approved",
    }),
    { code: 409 },
  );
  await adminWrite(db, "workspace-a", {
    action: "leave-review",
    id: result.id,
    status: "Approved",
    note: "Approved by operations",
  });
  await assert.rejects(
    adminWrite(db, "workspace-a", {
      action: "leave-review",
      id: result.id,
      status: "Declined",
    }),
    { code: 409 },
  );
  assert.equal((await deviceRead(db, employee)).leaves[0].status, "Approved");
  const state = await adminRead(db, "workspace-a");
  assert.ok(state.audit.some((a) => a.action === "leave-review"));
  assert.ok(!JSON.stringify(state).includes("token_hash"));
});
