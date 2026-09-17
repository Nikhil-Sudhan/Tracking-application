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
export const demo: State = {
  employees: [
    {
      id: "demo-1",
      name: "Arjun Mehta",
      email: "arjun@example.com",
      team: "Field sales",
      color: "#467064",
      lat: 12.975,
      lng: 77.607,
      accuracy: 12,
      battery: 84,
      lastSeen: Date.now() - 18000,
      shiftStart: Date.now() - 14400000,
      device: "Android",
    },
    {
      id: "demo-2",
      name: "Priya Sharma",
      email: "priya@example.com",
      team: "Field sales",
      color: "#8c6d4a",
      lat: 12.961,
      lng: 77.638,
      accuracy: 9,
      battery: 67,
      lastSeen: Date.now() - 35000,
      shiftStart: Date.now() - 13200000,
      device: "iOS",
    },
    {
      id: "demo-3",
      name: "Rahul Nair",
      email: "rahul@example.com",
      team: "Service",
      color: "#637bb3",
      lat: 12.994,
      lng: 77.57,
      accuracy: 18,
      battery: 53,
      lastSeen: Date.now() - 24000,
      shiftStart: Date.now() - 12800000,
      device: "Android",
    },
    {
      id: "demo-4",
      name: "Sneha Reddy",
      email: "sneha@example.com",
      team: "Service",
      color: "#967090",
      lat: 12.945,
      lng: 77.594,
      accuracy: 15,
      battery: 18,
      lastSeen: Date.now() - 960000,
      shiftStart: Date.now() - 15600000,
      device: "Android",
    },
    {
      id: "demo-5",
      name: "Vikram Singh",
      email: "vikram@example.com",
      team: "Field sales",
      color: "#548c96",
      lat: 13.012,
      lng: 77.628,
      accuracy: 11,
      battery: 76,
      lastSeen: Date.now() - 46000,
      shiftStart: Date.now() - 13500000,
      device: "iOS",
    },
    {
      id: "demo-6",
      name: "Ananya Rao",
      email: "ananya@example.com",
      team: "Service",
      color: "#ac7764",
      lat: 12.983,
      lng: 77.65,
      accuracy: 20,
      battery: 92,
      lastSeen: Date.now() - 7200000,
      shiftStart: null,
      device: "iOS",
    },
  ],
  tasks: [
    {
      id: "t1",
      employeeId: "demo-1",
      title: "Retail partner check-in",
      address: "Indiranagar, Bengaluru",
      due: "2026-09-17",
      status: "In progress",
    },
    {
      id: "t2",
      employeeId: "demo-2",
      title: "Product demo · Nova Stores",
      address: "Domlur, Bengaluru",
      due: "2026-09-17",
      status: "Assigned",
    },
    {
      id: "t3",
      employeeId: "demo-3",
      title: "Equipment maintenance",
      address: "Malleshwaram, Bengaluru",
      due: "2026-09-17",
      status: "Completed",
    },
  ],
  shifts: [],
};
