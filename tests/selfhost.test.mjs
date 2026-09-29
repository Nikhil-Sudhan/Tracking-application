import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
test(
  "self-hosted HTTP auth, CSRF, employee API and mobile role boundaries work together",
  { timeout: 30000 },
  async () => {
    const listener = createServer();
    await new Promise((r) => listener.listen(0, "127.0.0.1", r));
    const port = listener.address().port;
    await new Promise((r) => listener.close(r));
    const dir = mkdtempSync(join(tmpdir(), "grosuite-test-")),
      password = randomBytes(24).toString("hex"),
      salt = randomBytes(16).toString("hex");
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "backend/server.mjs"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(port),
          HOST: "127.0.0.1",
          COOKIE_SECURE: "false",
          PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
          DATA_DIR: dir,
          ADMIN_PASSWORD_HASH:
            salt + ":" + scryptSync(password, salt, 64).toString("hex"),
        },
        stdio: "pipe",
      },
    );
    let output = "";
    child.stderr.on("data", (d) => (output += d));
    child.stdout.on("data", (d) => (output += d));
    const origin = `http://127.0.0.1:${port}`;
    try {
      let online = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(origin + "/health")).ok) {
            online = true;
            break;
          }
        } catch {}
        if (child.exitCode !== null) throw new Error(output);
        await delay(100);
      }
      assert.ok(online, output);
      const post = (path, body, headers = {}) =>
        fetch(origin + path, {
          method: "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify(body),
        });
      assert.equal((await fetch(origin + "/api/admin")).status, 401);
      assert.equal(
        (
          await post(
            "/api/login",
            { password },
            { Origin: "https://evil.example" },
          )
        ).status,
        403,
      );
      assert.equal(
        (await post("/api/login", { password: "wrong" })).status,
        401,
      );
      const login = await post("/api/login", { password });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie");
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Strict/);
      const headers = { Cookie: cookie.split(";")[0] };
      const initialResponse = await fetch(origin + "/api/admin", { headers });
      assert.equal(initialResponse.status, 200);
      const initial = await initialResponse.json();
      for (const key of [
        "employees",
        "tasks",
        "shifts",
        "geofences",
        "leaves",
        "audit",
        "adminDevices",
      ]) {
        assert.deepEqual(
          initial[key],
          [],
          `Fresh workspace must have no ${key}`,
        );
      }
      const employeeResponse = await post(
        "/api/admin",
        {
          action: "employee",
          name: "Test employee",
          email: "test@example.com",
          team: "Sales",
        },
        headers,
      );
      assert.equal(employeeResponse.status, 200);
      const employee = await employeeResponse.json();
      assert.equal(
        (
          await post(
            "/api/admin",
            { action: "pair", id: employee.id },
            { ...headers, Origin: "https://evil.example" },
          )
        ).status,
        403,
      );
      const pair = await (
        await post("/api/admin", { action: "pair", id: employee.id }, headers)
      ).json();
      const device = await fetch(origin + "/api/device", {
        headers: { Authorization: "Bearer " + pair.token },
      });
      assert.equal(device.status, 200);
      assert.equal((await device.json()).employee.name, "Test employee");
      const adminPair = await (
        await post(
          "/api/admin",
          { action: "admin-pair", label: "Read only", role: "viewer" },
          headers,
        )
      ).json();
      const adminHeaders = { Authorization: "Bearer " + adminPair.token };
      const mobile = await fetch(origin + "/api/admin-mobile", {
        headers: adminHeaders,
      });
      assert.equal(mobile.status, 200);
      assert.equal((await mobile.json()).access.role, "viewer");
      assert.equal(
        (
          await post(
            "/api/admin-mobile",
            {
              action: "employee",
              name: "Blocked",
              email: "block@example.com",
              team: "Sales",
            },
            adminHeaders,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await post(
            "/api/device",
            {
              action: "start",
              shiftId: crypto.randomUUID(),
              device: "Android",
            },
            adminHeaders,
          )
        ).status,
        401,
      );
      assert.equal((await post("/api/logout", {}, headers)).status, 200);
      assert.equal(
        (await fetch(origin + "/api/admin", { headers })).status,
        401,
      );
    } finally {
      const exited = new Promise((r) => child.once("exit", r));
      child.kill();
      await exited;
      if (
        dirname(resolve(dir)) === resolve(tmpdir()) &&
        basename(dir).startsWith("grosuite-test-")
      )
        rmSync(dir, { recursive: true, force: true });
    }
  },
);
