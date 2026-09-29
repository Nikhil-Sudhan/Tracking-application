import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

export function openDatabase(filename) {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000",
  );
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, hash TEXT NOT NULL)",
  );
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(
      new URL("../drizzle/" + name, import.meta.url),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const hash = createHash("sha256").update(sql).digest("hex");
    const applied = sqlite
      .prepare("SELECT hash FROM _migrations WHERE name=?")
      .get(name);
    if (applied) {
      if (applied.hash !== hash)
        throw new Error("Applied migration changed: " + name);
      continue;
    }
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      sqlite.exec(sql);
      sqlite.prepare("INSERT INTO _migrations VALUES (?,?)").run(name, hash);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  const db = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return stmt.get(...args) ?? null;
        },
        async all() {
          return { results: stmt.all(...args) };
        },
        async run() {
          return { meta: { changes: Number(stmt.run(...args).changes) } };
        },
        execute() {
          return stmt.columns().length
            ? { results: stmt.all(...args) }
            : {
                results: [],
                meta: { changes: Number(stmt.run(...args).changes) },
              };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = statements.map((s) => s.execute());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, sqlite };
}
