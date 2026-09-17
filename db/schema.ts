import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    team: text("team").notNull(),
    color: text("color").notNull(),
    lat: real("lat"),
    lng: real("lng"),
    accuracy: real("accuracy"),
    battery: integer("battery"),
    lastSeen: integer("last_seen"),
    shiftStart: integer("shift_start"),
    device: text("device"),
    tokenHash: text("token_hash"),
  },
  (t) => [
    index("employees_owner").on(t.owner),
    uniqueIndex("employees_token").on(t.tokenHash),
  ],
);
export const shifts = sqliteTable(
  "shifts",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    started: integer("started").notNull(),
    ended: integer("ended"),
  },
  (t) => [
    index("shifts_employee").on(t.employeeId),
    uniqueIndex("shifts_one_active")
      .on(t.employeeId)
      .where(sql`${t.ended} IS NULL`),
  ],
);
export const points = sqliteTable(
  "points",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    shiftId: text("shift_id")
      .notNull()
      .references(() => shifts.id),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    accuracy: real("accuracy").notNull(),
    captured: integer("captured").notNull(),
    battery: integer("battery"),
  },
  (t) => [index("points_employee_time").on(t.employeeId, t.captured)],
);
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    title: text("title").notNull(),
    address: text("address").notNull(),
    due: text("due").notNull(),
    status: text("status").notNull(),
  },
  (t) => [index("tasks_employee").on(t.employeeId)],
);
