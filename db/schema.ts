import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  check,
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
    siteName: text("site_name"),
    checkinLat: real("checkin_lat"),
    checkinLng: real("checkin_lng"),
    checkinAccuracy: real("checkin_accuracy"),
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

export const geofences = sqliteTable(
  "geofences",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    team: text("team").notNull().default(""),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    radius: integer("radius").notNull(),
    active: integer("active").notNull().default(1),
    created: integer("created").notNull(),
  },
  (t) => [
    index("geofences_owner").on(t.owner),
    check("geofences_radius", sql`${t.radius} BETWEEN 50 AND 10000`),
  ],
);
export const leaveRequests = sqliteTable(
  "leave_requests",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    kind: text("kind").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("Pending"),
    reviewNote: text("review_note").notNull().default(""),
    created: integer("created").notNull(),
    reviewed: integer("reviewed"),
  },
  (t) => [index("leave_employee").on(t.employeeId, t.startDate)],
);
export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    subject: text("subject").notNull(),
    created: integer("created").notNull(),
  },
  (t) => [index("audit_owner_time").on(t.owner, t.created)],
);
export const adminDevices = sqliteTable(
  "admin_devices",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    role: text("role").notNull(),
    expires: integer("expires").notNull(),
    created: integer("created").notNull(),
    revoked: integer("revoked"),
  },
  (t) => [index("admin_devices_owner").on(t.owner)],
);
