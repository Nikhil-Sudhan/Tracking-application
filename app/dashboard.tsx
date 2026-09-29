"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Battery,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Crosshair,
  LayoutGrid,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Users,
  WifiOff,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  initials,
  status,
  type Employee,
  type State,
  type Point,
} from "@/lib/model";
import TeamMap from "./team-map";
import Operations from "./operations";
const nav = [
  { name: "Live overview", icon: LayoutGrid },
  { name: "Team", icon: Users },
  { name: "Attendance", icon: Clock3 },
  { name: "Tasks", icon: BriefcaseBusiness },
  { name: "Sites & geofences", icon: MapPin },
  { name: "Leave requests", icon: Check },
  { name: "Alerts", icon: Activity },
  { name: "Activity log", icon: Clock3 },
  { name: "Admin devices", icon: Smartphone },
  { name: "Settings", icon: Settings2 },
];
const empty: State = { employees: [], tasks: [], shifts: [] };
function NavigationButton(
  props: React.ComponentProps<typeof SidebarMenuButton>,
) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        setOpenMobile(false);
      }}
    />
  );
}
const age = (n: number | null) =>
  n
    ? `${Math.max(0, Math.floor((Date.now() - n) / 60000))} min ago`
    : "Never synced";
function Avatar({ e }: { e: Employee }) {
  return (
    <span className="avatar" style={{ background: e.color }}>
      {initials(e.name)}
    </span>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span className={"status " + value.toLowerCase().replaceAll(" ", "-")}>
      {value}
    </span>
  );
}
function Picker({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  items: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export default function Dashboard({
  onSignOut,
}: { onSignOut?: () => void } = {}) {
  const [state, setState] = useState<State>(empty),
    [page, setPage] = useState("Live overview"),
    [search, setSearchValue] = useState(""),
    [team, setTeamValue] = useState("All teams"),
    [filter, setFilterValue] = useState("Everyone"),
    [selected, setSelectedValue] = useState<string | null>(null),
    [points, setPoints] = useState<Point[]>([]),
    [history, setHistory] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState<"employee" | "task" | "pair" | null>(null),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [clock, setClock] = useState(0);
  const viewStatus = (employee: Employee) => status(employee, clock);
  function clearRoute() {
    setPoints([]);
    setHistory(false);
  }
  function setSearch(value: string) {
    setSearchValue(value);
    clearRoute();
  }
  function setTeam(value: string) {
    setTeamValue(value);
    clearRoute();
  }
  function setFilter(value: string) {
    setFilterValue(value);
    clearRoute();
  }
  function setSelected(value: string | null) {
    setSelectedValue(value);
    clearRoute();
  }
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const r = await fetch("/api/admin");
      if (!r.ok)
        throw new Error(
          r.status === 401
            ? "Sign in to open your workspace."
            : "Could not load your team. Please retry.",
        );
      const d = (await r.json()) as State;
      if (sequence === requestSequence.current) {
        setState(d);
        setError("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(load, 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setClock(Date.now()));
    const t = setInterval(() => setClock(Date.now()), 30000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(t);
    };
  }, []);
  const employees = state.employees.filter(
    (e) =>
      (team === "All teams" || e.team === team) &&
      (filter === "Everyone" || viewStatus(e) === filter) &&
      `${e.name} ${e.team}`.toLowerCase().includes(search.toLowerCase()),
  );
  const person = employees.find((e) => e.id === selected);
  const active = state.employees.filter(
      (e) => viewStatus(e) === "On duty",
    ).length,
    unreachable = state.employees.filter(
      (e) => viewStatus(e) === "Location stale",
    ).length,
    off = state.employees.length - active - unreachable;
  async function mutate(action: string, data: unknown) {
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(data as object) }),
    });
    const v = (await r.json()) as {
      error?: string;
      token?: string;
      id?: string;
      ok?: boolean;
    };
    if (!r.ok) throw new Error(v.error || "Could not save changes");
    await load();
    return v;
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const r = await mutate(
        dialog === "employee" ? "employee" : "task",
        Object.fromEntries(form),
      );
      if (r) {
        setDialog(null);
        toast.success(
          dialog === "employee" ? "Employee added" : "Task assigned",
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pair(e: Employee) {
    setBusy(true);
    try {
      const r = await mutate("pair", { id: e.id });
      if (r) {
        setToken(r.token ?? "");
        setDialog("pair");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function route() {
    if (!person) return;
    try {
      const r = await fetch(
        "/api/admin?employee=" + encodeURIComponent(person.id),
      );
      if (!r.ok) throw new Error("Could not load route history");
      const d = (await r.json()) as { points: Point[] };
      setPoints(d.points);
      setHistory(true);
      if (!d.points.length)
        toast.info("No location points recorded in the last 24 hours.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function exportCsv() {
    const safe = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@\-]/, "'")
        .replaceAll('"', '""') +
      '"';
    const rows =
      page === "Attendance"
        ? [
            ["Employee", "Started", "Ended"],
            ...state.shifts.map((s) => [
              state.employees.find((e) => e.id === s.employeeId)?.name,
              new Date(s.started).toISOString(),
              s.ended ? new Date(s.ended).toISOString() : "On duty",
            ]),
          ]
        : [
            [
              "Employee",
              "Team",
              "Status",
              "Latitude",
              "Longitude",
              "Last synced",
            ],
            ...employees.map((e) => [
              e.name,
              e.team,
              viewStatus(e),
              e.lat,
              e.lng,
              e.lastSeen ? new Date(e.lastSeen).toISOString() : "",
            ]),
          ];
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.map(safe).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `grosuite-field-${page.toLowerCase().replaceAll(" ", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "230px" } as React.CSSProperties}
    >
      <Sidebar className="app-sidebar">
        <SidebarHeader>
          <button
            type="button"
            className="brand"
            aria-label="Go to live overview"
            onClick={() => setPage("Live overview")}
          >
            <span className="brand-lockup">
              <span className="brand-word">
                GR
                <svg viewBox="0 0 40 40" aria-hidden="true">
                  <path d="M20 4 A16 16 0 0 0 4 20" stroke="#d7263d" />
                  <path d="M20 4 A16 16 0 0 1 36 20" stroke="#17a34a" />
                  <path d="M36 20 A16 16 0 0 1 20 36" stroke="#2a6df4" />
                  <path d="M4 20 A16 16 0 0 0 20 36" stroke="#dba21e" />
                </svg>
                SUITE
              </span>
              <small>FIELD</small>
            </span>
          </button>
          <div className="workspace-label">
            <span className="workspace-icon">F</span>
            <div>
              <b>Field operations</b>
              <small>Admin workspace</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="nav-label">WORKSPACE</div>
          <SidebarMenu>
            {nav.map((n) => (
              <SidebarMenuItem key={n.name}>
                <NavigationButton
                  isActive={page === n.name}
                  onClick={() => setPage(n.name)}
                  className="nav-button"
                >
                  <n.icon size={18} />
                  <span>{n.name}</span>
                  {n.name === "Tasks" && (
                    <span className="nav-count">
                      {
                        state.tasks.filter((t) => t.status !== "Completed")
                          .length
                      }
                    </span>
                  )}
                </NavigationButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <button className="help-button" onClick={() => setPage("Settings")}>
            <CircleHelp size={18} />
            Setup & help
            <ChevronRight size={15} />
          </button>
          <div className="admin-profile">
            <span className="avatar admin">AD</span>
            <div>
              <b>Workspace admin</b>
              <small>Operations manager</small>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{page}</b>
          </div>
          <div className="top-actions">
            {onSignOut && (
              <button className="button secondary" onClick={onSignOut}>
                Sign out
              </button>
            )}
            <span className="connection">
              <span />
              {error ? "Connection interrupted" : "Refreshes every 15s"}
            </span>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">FIELD OPERATIONS</div>
              <h1>{page === "Live overview" ? "Live overview" : page}</h1>
              <p>
                {page === "Live overview"
                  ? "Employee locations, shift status, and field assignments."
                  : page === "Team"
                    ? "Manage your field team and connected devices."
                    : page === "Attendance"
                      ? "Shift records, from clock-in to clock-out."
                      : page === "Tasks"
                        ? "Assign visits and track task completion."
                        : page === "Sites & geofences"
                          ? "Manage where your team can clock in."
                          : page === "Leave requests"
                            ? "Review time off and keep decisions in one place."
                            : page === "Alerts"
                              ? "Location and device exceptions during active shifts."
                              : page === "Activity log"
                                ? "Recent changes across your workspace."
                                : page === "Admin devices"
                                  ? "Manage access for your operations team’s phones."
                                  : "Set up your field operations workspace."}
              </p>
            </div>
            {["Live overview", "Team", "Tasks"].includes(page) && (
              <div className="heading-actions">
                <button className="button secondary" onClick={exportCsv}>
                  <ArrowDownToLine size={16} />
                  Export team
                </button>
                <button
                  className="button primary"
                  onClick={() =>
                    setDialog(page === "Tasks" ? "task" : "employee")
                  }
                >
                  <Plus size={17} />
                  {page === "Tasks" ? "Assign task" : "Add employee"}
                </button>
              </div>
            )}
          </div>
          {error && (
            <div role="alert" className="error-box">
              {error}{" "}
              <a
                href={onSignOut ? "/" : "/signin-with-chatgpt?return_to=/"}
                target="_top"
              >
                Sign in
              </a>
              <button onClick={load}>Retry</button>
            </div>
          )}
          {page === "Live overview" && (
            <>
              <section className="stat-grid">
                {[
                  {
                    label: "Total employees",
                    value: state.employees.length,
                    foot: "Across all teams",
                    icon: Users,
                    color: "blue",
                  },
                  {
                    label: "On duty",
                    value: active,
                    foot: "Location received within 5 min",
                    icon: Radio,
                    color: "green",
                  },
                  {
                    label: "Location stale",
                    value: unreachable,
                    foot: "No location for over 5 min",
                    icon: WifiOff,
                    color: "amber",
                  },
                  {
                    label: "Off duty",
                    value: off,
                    foot: "Not on an active shift",
                    icon: Clock3,
                    color: "gray",
                  },
                ].map((s) => (
                  <button
                    key={s.label}
                    className="stat-card"
                    onClick={() =>
                      setFilter(
                        s.label === "Total employees" ? "Everyone" : s.label,
                      )
                    }
                  >
                    <div className="stat-top">
                      {s.label}
                      <span className={"stat-icon " + s.color}>
                        <s.icon size={18} />
                      </span>
                    </div>
                    <strong>
                      {loading ? "—" : s.value.toString().padStart(2, "0")}
                    </strong>
                    <div className="stat-foot">
                      <span className={"tiny-dot " + s.color} />
                      {s.foot}
                    </div>
                  </button>
                ))}
              </section>
              <section className="tracking-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Live team map <span className="live-chip">LIVE</span>
                    </h2>
                    <span className="subtle">
                      {employees.length} employees in this view
                    </span>
                  </div>
                  <div className="map-filters">
                    <Picker
                      value={team}
                      onChange={setTeam}
                      items={[
                        "All teams",
                        ...new Set(state.employees.map((e) => e.team)),
                      ]}
                      label="Team filter"
                    />
                    <button
                      aria-label="Refresh team locations"
                      className="icon-button"
                      onClick={load}
                    >
                      <RefreshCw size={17} />
                    </button>
                  </div>
                </div>
                <div className="tracking-body">
                  <aside className="employee-rail">
                    <div className="rail-search">
                      <Search size={16} />
                      <input
                        placeholder="Find an employee…"
                        aria-label="Find an employee"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <Tabs value={filter} onValueChange={setFilter}>
                      <TabsList className="team-tabs">
                        <TabsTrigger value="Everyone">Everyone</TabsTrigger>
                        <TabsTrigger value="On duty">On duty</TabsTrigger>
                        <TabsTrigger value="Location stale">Alerts</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <div className="employee-list">
                      {employees.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => setSelected(e.id)}
                          className={
                            "employee-card " +
                            (selected === e.id ? "selected" : "")
                          }
                        >
                          <Avatar e={e} />
                          <div className="employee-summary">
                            <b>{e.name}</b>
                            <span>{e.team}</span>
                            <div>
                              <Badge value={viewStatus(e)} />
                              <small>{age(e.lastSeen)}</small>
                            </div>
                          </div>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                      {!employees.length && (
                        <div className="empty-state">
                          <Users size={27} />
                          <b>
                            {loading ? "Loading team…" : "No employees here"}
                          </b>
                          <p>
                            {search
                              ? "Try another name or team."
                              : "Add an employee to get started."}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="rail-footer">
                      <ShieldCheck size={14} />
                      Locations shared during active shifts
                    </div>
                  </aside>
                  <div className="map-region">
                    <TeamMap
                      geofences={state.geofences?.filter((s) => s.active)}
                      employees={employees}
                      selected={selected}
                      onSelect={setSelected}
                      points={points}
                      now={clock}
                    />
                    <div className="map-caption">
                      <MapPin size={14} />
                      Employee locations
                      <span>OpenStreetMap</span>
                    </div>
                    {person && (
                      <div className="location-detail">
                        <div className="detail-person">
                          <Avatar e={person} />
                          <div>
                            <b>{person.name}</b>
                            <span>
                              {person.team} ·{" "}
                              {person.device || "No device paired"}
                            </span>
                          </div>
                          <Badge value={viewStatus(person)} />
                        </div>
                        <div className="detail-metrics">
                          <span>
                            <Battery size={15} />
                            {person.battery === null
                              ? "—"
                              : person.battery + "%"}{" "}
                            battery
                          </span>
                          <span>
                            <Crosshair size={15} />
                            {person.accuracy === null
                              ? "No GPS fix"
                              : "±" + Math.round(person.accuracy) + " m"}
                          </span>
                          <span>
                            <Clock3 size={15} />
                            {age(person.lastSeen)}
                          </span>
                        </div>
                        <button className="route-button" onClick={route}>
                          <Activity size={15} />
                          {history
                            ? `${points.length} points · last 24 hours`
                            : "View route history"}
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    )}
                    <div className="map-legend">
                      <span>
                        <i className="tiny-dot green" />
                        On duty
                      </span>
                      <span>
                        <i className="tiny-dot amber" />
                        Location stale
                      </span>
                      <span>
                        <i className="tiny-dot gray" />
                        Off duty
                      </span>
                    </div>
                  </div>
                </div>
              </section>
              <div className="bottom-grid">
                <section className="mini-panel">
                  <div className="panel-heading">
                    <h2>Recent assignments</h2>
                    <button
                      className="text-button"
                      onClick={() => setPage("Tasks")}
                    >
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  {state.tasks.slice(0, 3).map((t) => (
                    <div className="assignment-row" key={t.id}>
                      <span
                        className={
                          "task-icon " +
                          (t.status === "Completed" ? "done" : "")
                        }
                      >
                        <BriefcaseBusiness size={17} />
                      </span>
                      <div>
                        <b>{t.title}</b>
                        <small>
                          {
                            state.employees.find((e) => e.id === t.employeeId)
                              ?.name
                          }{" "}
                          · {t.address}
                        </small>
                      </div>
                      <Badge value={t.status} />
                    </div>
                  ))}
                  {!state.tasks.length && (
                    <p className="padded subtle">No tasks assigned yet.</p>
                  )}
                </section>
                <section className="mini-panel health-panel">
                  <div className="panel-heading">
                    <h2>Needs attention</h2>
                    <span className="count-pill">{unreachable}</span>
                  </div>
                  {state.employees
                    .filter((e) => viewStatus(e) === "Location stale")
                    .map((e) => (
                      <button
                        className="attention-row"
                        key={e.id}
                        onClick={() => {
                          setSelected(e.id);
                          setFilter("Everyone");
                        }}
                      >
                        <span className="alert-icon">
                          <WifiOff size={18} />
                        </span>
                        <div>
                          <b>{e.name} has a stale location</b>
                          <small>
                            {"Last update " + age(e.lastSeen)} · Check location
                            sharing
                          </small>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  {!unreachable && (
                    <div className="all-clear">
                      <ShieldCheck size={22} />
                      <span>No connectivity alerts</span>
                    </div>
                  )}
                  <div className="health-note">
                    An old location is always marked as stale.
                  </div>
                </section>
              </div>
            </>
          )}
          {page === "Team" && (
            <section className="table-panel">
              <div className="panel-heading">
                <h2>
                  Your people{" "}
                  <span className="count-pill">{state.employees.length}</span>
                </h2>
                <div className="rail-search">
                  <Search size={16} />
                  <input
                    aria-label="Search team"
                    placeholder="Search team…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Employee", "Team", "Status", "Device", "Actions"].map(
                      (s) => (
                        <TableHead key={s}>{s}</TableHead>
                      ),
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="person-cell">
                          <Avatar e={e} />
                          <div>
                            <b>{e.name}</b>
                            <small>{e.email}</small>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{e.team}</TableCell>
                      <TableCell>
                        <Badge value={viewStatus(e)} />
                      </TableCell>
                      <TableCell>{e.device || "Not connected"}</TableCell>
                      <TableCell>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => pair(e)}
                        >
                          <Smartphone size={16} />
                          Pair / rotate key
                        </button>
                        <button
                          className="text-button danger"
                          disabled={busy}
                          onClick={async () => {
                            try {
                              const r = await mutate("revoke", { id: e.id });
                              if (r) toast.success("Device access revoked");
                            } catch (err) {
                              toast.error((err as Error).message);
                            }
                          }}
                        >
                          Revoke access
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!employees.length && (
                <div className="empty-state">
                  <Users />
                  <b>No team members yet</b>
                  <p>Add employees, then pair their mobile apps.</p>
                </div>
              )}
            </section>
          )}
          {[
            "Attendance",
            "Sites & geofences",
            "Leave requests",
            "Alerts",
            "Activity log",
            "Admin devices",
          ].includes(page) && (
            <Operations
              page={page}
              state={state}
              mutate={mutate}
              clock={clock}
            />
          )}
          {page === "Tasks" && (
            <div className="task-board">
              {(["Assigned", "In progress", "Completed"] as const).map(
                (column) => (
                  <section key={column}>
                    <div className="column-title">
                      <h2>{column}</h2>
                      <span className="count-pill">
                        {state.tasks.filter((t) => t.status === column).length}
                      </span>
                    </div>
                    {state.tasks
                      .filter((t) => t.status === column)
                      .map((t) => (
                        <article className="task-card" key={t.id}>
                          <span className="task-eyebrow">FIELD VISIT</span>
                          <h3>{t.title}</h3>
                          <p>
                            <MapPin size={14} />
                            {t.address}
                          </p>
                          <p>
                            <Clock3 size={14} />
                            {t.due}
                          </p>
                          <div className="task-assignee">
                            {
                              state.employees.find((e) => e.id === t.employeeId)
                                ?.name
                            }
                          </div>
                          <Picker
                            value={t.status}
                            items={["Assigned", "In progress", "Completed"]}
                            label={"Status for " + t.title}
                            onChange={async (value) => {
                              try {
                                await mutate("task-status", {
                                  id: t.id,
                                  status: value,
                                });
                              } catch (e) {
                                toast.error((e as Error).message);
                              }
                            }}
                          />
                        </article>
                      ))}
                    {!state.tasks.some((t) => t.status === column) && (
                      <p className="empty-column">No tasks here yet</p>
                    )}
                  </section>
                ),
              )}
            </div>
          )}
          {page === "Settings" && (
            <div className="settings-grid">
              <section className="mini-panel settings-card">
                <Smartphone size={28} />
                <h2>Connect your employee apps</h2>
                <ol>
                  <li>
                    Open <b>Team</b> and add your employees.
                  </li>
                  <li>On the Team page, generate a device key.</li>
                  <li>
                    Install GroSuite Field on the employee’s Android phone.
                  </li>
                  <li>Enter your mobile API address and the device key.</li>
                  <li>Allow location access and start a shift.</li>
                </ol>
                <p className="notice">
                  Use your server’s HTTPS address in both mobile apps. Employee
                  keys come from Team; admin keys come from Admin devices.
                </p>
              </section>
              <section className="mini-panel settings-card">
                <ShieldCheck size={28} />
                <h2>Tracking controls</h2>
                <p>
                  Employees explicitly start and end their shifts. The app shows
                  when location sharing is active. Off-duty locations are
                  rejected by the server.
                </p>
                <ul>
                  <li>Dashboard refresh: 15 seconds</li>
                  <li>Stale location threshold: 5 minutes</li>
                  <li>Device keys: revocable per employee</li>
                  <li>Route view: last 24 hours</li>
                  <li>Offline points: queued on the device</li>
                </ul>
                <p className="notice">
                  Location records follow your server’s retention period.
                  Clock-in site checks apply to active sites assigned to the
                  employee’s team.
                </p>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>GroSuite Field · Field operations workspace</span>
            <span>
              <ShieldCheck size={13} />
              Workspace access
            </span>
          </footer>
        </div>
      </main>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            setToken("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "employee"
                ? "Add an employee"
                : dialog === "task"
                  ? "Assign a field task"
                  : "Pair an employee device"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "pair"
                ? "This key grants access to this employee only. Store it securely; it is shown once. Generating a new key revokes the previous one."
                : "Changes will be saved to your workspace."}
            </DialogDescription>
          </DialogHeader>
          {dialog === "pair" ? (
            <div className="pair-content">
              <label>
                Device key
                <textarea readOnly value={token} rows={3} />
              </label>
              <button
                className="button primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(token);
                    toast.success("Device key copied");
                  } catch {
                    toast.error("Select and copy the key manually");
                  }
                }}
              >
                <Check size={16} />
                Copy device key
              </button>
            </div>
          ) : (
            <form className="entry-form" onSubmit={submit}>
              {dialog === "employee" ? (
                <>
                  <label>
                    Full name
                    <input
                      name="name"
                      required
                      maxLength={100}
                      placeholder="e.g. Arjun Mehta"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      required
                      maxLength={160}
                      placeholder="employee@company.com"
                    />
                  </label>
                  <label>
                    Team
                    <input
                      name="team"
                      required
                      maxLength={60}
                      placeholder="e.g. Field sales"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Task title
                    <input name="title" required maxLength={160} />
                  </label>
                  <label>
                    Employee
                    <Select name="employeeId" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {state.employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label>
                    Visit address
                    <input name="address" required maxLength={300} />
                  </label>
                  <label>
                    Due date
                    <input name="due" type="date" required />
                  </label>
                </>
              )}
              <button className="button primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : dialog === "employee"
                    ? "Add employee"
                    : "Assign task"}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Toaster position="bottom-right" />
    </SidebarProvider>
  );
}
