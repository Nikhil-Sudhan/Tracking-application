export type Employee = {
  id: string;
  name: string;
  email: string;
  team: string;
  color: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  battery: number | null;
  lastSeen: number | null;
  shiftStart: number | null;
  device: string | null;
};
export type Task = {
  id: string;
  employeeId: string;
  title: string;
  address: string;
  due: string;
  status: "Assigned" | "In progress" | "Completed";
};
export type Shift = {
  id: string;
  employeeId: string;
  started: number;
  ended: number | null;
};
export type Point = {
  id: string;
  employeeId: string;
  shiftId: string;
  lat: number;
  lng: number;
  accuracy: number;
  captured: number;
  battery: number | null;
};
export type State = { employees: Employee[]; tasks: Task[]; shifts: Shift[] };
export function status(e: Employee, now = Date.now()) {
  return !e.shiftStart
    ? "Off duty"
    : !e.lastSeen || now - e.lastSeen > 300000
      ? "Location stale"
      : "On duty";
}
export function initials(n: string) {
  return n
    .split(" ")
    .map((v) => v[0])
    .slice(0, 2)
    .join("");
}
