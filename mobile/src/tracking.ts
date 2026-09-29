import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as Battery from "expo-battery";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import {
  active,
  credentials,
  db,
  getValue,
  setValue,
  type QueuedPoint,
  type Session,
} from "./store";
export const LOCATION_TASK = "fieldpulse-shift-locations";
export class NetworkError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export async function api(
  body?: unknown,
  candidate?: { url: string; token: string },
) {
  const c = candidate ?? (await credentials());
  if (!c) throw new NetworkError("Pair your device first.");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(c.url + "/api/device", {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + c.token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const d = await r.json().catch(() => ({
      error: "The API address returned an invalid response.",
    }));
    if (!r.ok) throw new NetworkError(d.error || "Sync failed", r.status);
    return d;
  } catch (e) {
    if (e instanceof NetworkError) throw e;
    throw new NetworkError(
      "Cannot reach your workspace. Locations remain queued on this device.",
    );
  } finally {
    clearTimeout(timer);
  }
}
let syncing: Promise<void> | null = null;
export function sync() {
  return (syncing ??= (async () => {
    const d = await db();
    for (;;) {
      const first = await d.getFirstAsync<QueuedPoint>(
        "SELECT * FROM queue ORDER BY captured LIMIT 1",
      );
      if (!first) break;
      const rows = await d.getAllAsync<QueuedPoint>(
        "SELECT * FROM queue WHERE shiftId=? ORDER BY captured LIMIT 100",
        first.shiftId,
      );
      const r = await api({
        action: "locations",
        shiftId: first.shiftId,
        points: rows.map(({ shiftId: _, ...p }) => p),
      });
      await d.withExclusiveTransactionAsync(async (txn) => {
        for (const id of [
          ...r.accepted,
          ...(r.rejected ?? []).map((p: { id: string }) => p.id),
        ])
          await txn.runAsync("DELETE FROM queue WHERE id=?", id);
      });
      if (r.rejected?.length)
        await setValue(
          "syncNotice",
          `${r.rejected.length} location updates were outside a shift or older than seven days and were not saved.`,
        );
    }
    const stops = await d.getAllAsync<{ shiftId: string; ended: number }>(
      "SELECT * FROM pending_stops ORDER BY ended",
    );
    for (const s of stops) {
      await api({ action: "stop", ...s });
      await d.runAsync("DELETE FROM pending_stops WHERE shiftId=?", s.shiftId);
    }
    await setValue("lastSync", Date.now());
    await setValue("syncError", null);
  })()
    .catch(async (e) => {
      await setValue("syncError", (e as Error).message);
      if (e instanceof NetworkError && e.status === 401) {
        await pauseLocally();
      }
      throw e;
    })
    .finally(() => {
      syncing = null;
    }));
}
async function pauseLocally() {
  await setValue("active", null);
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}
async function enqueue(
  locations: Location.LocationObject[],
  expectedShiftId?: string,
) {
  const battery = await Battery.getBatteryLevelAsync().catch(() => -1);
  const d = await db();
  await d.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key=?",
      "active",
    );
    const session = row ? (JSON.parse(row.value) as Session | null) : null;
    if (!session) {
      console.info("[GroSuite location] skipped: no active shift");
      return;
    }
    if (expectedShiftId && session.shiftId !== expectedShiftId) return;
    for (const loc of locations) {
      if (
        loc.mocked ||
        loc.timestamp < session.started ||
        loc.timestamp > Date.now() + 30000 ||
        loc.coords.accuracy === null
      ) {
        console.info(
          "[GroSuite location] rejected",
          JSON.stringify({
            mocked: loc.mocked,
            captured: loc.timestamp,
            shiftStarted: session.started,
            now: Date.now(),
            accuracy: loc.coords.accuracy,
          }),
        );
        continue;
      }
      await txn.runAsync(
        "INSERT OR IGNORE INTO queue (id,shiftId,lat,lng,accuracy,captured,battery) VALUES (?,?,?,?,?,?,?)",
        Crypto.randomUUID(),
        session.shiftId,
        loc.coords.latitude,
        loc.coords.longitude,
        loc.coords.accuracy,
        Math.min(Date.now(), loc.timestamp),
        battery < 0 ? null : Math.round(battery * 100),
      );
      console.info("[GroSuite location] queued");
    }
  });
}
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.warn("[GroSuite location] task error", error.message);
      await setValue("syncError", error.message);
      return;
    }
    if (!data) return;
    console.info("[GroSuite location] received", data.locations?.length);
    try {
      await enqueue(data.locations);
      await sync();
    } catch (e) {
      console.warn(
        "[GroSuite location] processing failed",
        (e as Error).message,
      );
      await setValue("syncError", (e as Error).message);
    }
  },
);
export async function startShift() {
  await sync();
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted")
    throw new Error(
      "Location access is needed during your shift. You can enable it in Settings.",
    );
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted")
    throw new Error(
      "Choose Always / Allow all the time to share your work location while the app is in the background.",
    );
  const pending =
    (await getValue<string>("pendingStart")) ?? Crypto.randomUUID();
  await setValue("pendingStart", pending);
  const policy = await api();
  let location:
    | {
        lat: number;
        lng: number;
        accuracy: number | null;
        captured: number;
        mocked: boolean;
      }
    | undefined;
  if (policy.sites?.length && !policy.shift) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  "Could not get an accurate location. Move outdoors and try clocking in again.",
                ),
              ),
            25000,
          );
        }),
      ]);
      location = {
        lat: fix.coords.latitude,
        lng: fix.coords.longitude,
        accuracy: fix.coords.accuracy,
        captured: fix.timestamp,
        mocked: fix.mocked ?? false,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  const result = await api({
    action: "start",
    shiftId: pending,
    device: Platform.OS === "ios" ? "iOS" : "Android",
    ...(location ? { location } : {}),
  });
  const session: Session = {
    shiftId: result.shift.id,
    started: result.shift.started,
  };
  await setValue("active", session);
  await setValue("pendingStart", null);
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 0,
      timeInterval: 30000,
      deferredUpdatesInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "GroSuite Field · Shift active",
        notificationBody:
          "Your work location is being shared. End your shift in GroSuite Field to stop.",
        notificationColor: "#dc6e37",
      },
    });
  } catch (e) {
    await endShift();
    throw e;
  }
  // The native service is running: don't hold the shift button behind a GPS fix.
  // A delayed fix is accepted only for the shift that requested it.
  void (async () => {
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      await enqueue([position], session.shiftId);
      await sync();
    } catch (e) {
      await setValue("syncError", (e as Error).message);
    }
  })().catch(() => {});
  return session;
}
export async function endShift() {
  const s = await active();
  if (s) {
    const d = await db();
    await d.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        "INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)",
        "active",
        "null",
      );
      await txn.runAsync(
        "INSERT OR IGNORE INTO pending_stops (shiftId,ended) VALUES (?,?)",
        s.shiftId,
        Math.max(s.started, Date.now()),
      );
    });
  }
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  // Stopping local collection completes immediately, including when offline.
  // sync persists its own error and the stop remains queued until acknowledged.
  void sync().catch(() => {});
}
