import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
export type Session = { shiftId: string; started: number };
export type QueuedPoint = {
  id: string;
  shiftId: string;
  lat: number;
  lng: number;
  accuracy: number;
  captured: number;
  battery: number | null;
};
let opened: Promise<SQLite.SQLiteDatabase> | null = null;
export function db() {
  return (opened ??= (async () => {
    const d = await SQLite.openDatabaseAsync("fieldpulse.db");
    await d.execAsync(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS queue (id TEXT PRIMARY KEY,shiftId TEXT NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,accuracy REAL NOT NULL,captured INTEGER NOT NULL,battery INTEGER); CREATE TABLE IF NOT EXISTS pending_stops (shiftId TEXT PRIMARY KEY,ended INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS queue_time ON queue(captured);",
    );
    return d;
  })());
}
export async function getValue<T>(key: string): Promise<T | null> {
  const row = await (
    await db()
  ).getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key=?",
    key,
  );
  return row ? JSON.parse(row.value) : null;
}
export async function setValue(key: string, value: unknown) {
  await (
    await db()
  ).runAsync(
    "INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)",
    key,
    JSON.stringify(value),
  );
}
export async function active() {
  return getValue<Session>("active");
}
export async function credentials() {
  const value = await SecureStore.getItemAsync("fieldpulse-credentials");
  return value ? (JSON.parse(value) as { url: string; token: string }) : null;
}
export async function saveCredentials(value: { url: string; token: string }) {
  await SecureStore.setItemAsync(
    "fieldpulse-credentials",
    JSON.stringify(value),
    { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
  );
}
export async function queueCount() {
  return (
    (
      await (
        await db()
      ).getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM queue")
    )?.n ?? 0
  );
}
