"use client";
import { useState } from "react";
import {
  MapPin,
  Plus,
  ShieldCheck,
  Smartphone,
  AlertTriangle,
  Check,
  ArrowDownToLine,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { status, type State } from "@/lib/model";
import TeamMap from "./team-map";
type Props = {
  page: string;
  state: State;
  mutate: (action: string, data: unknown) => Promise<{ token?: string }>;
  clock: number;
};
const minutes = (start: number, end: number) =>
  Math.max(0, Math.round((end - start) / 60000));
const duration = (value: number) => `${Math.floor(value / 60)}h ${value % 60}m`;
function Choice({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i} value={i}>
            {i}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Blank({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <ShieldCheck />
      <b>{title}</b>
      <p>{children}</p>
    </div>
  );
}
export default function Operations({ page, state, mutate, clock }: Props) {
  const [dialog, setDialogValue] = useState<"site" | "admin" | null>(null),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState("");
  const [dialogKind, setDialogKind] = useState<"site" | "admin">("site");
  function setDialog(value: "site" | "admin" | null) {
    if (value) setDialogKind(value);
    setDialogValue(value);
  }
  const [lat, setLat] = useState(""),
    [lng, setLng] = useState(""),
    [radius, setRadius] = useState("200");
  const [filter, setFilter] = useState("Pending"),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [date, setDate] = useState(""),
    [team, setTeam] = useState("All teams");
  const sites = state.geofences ?? [],
    leaves = state.leaves ?? [],
    devices = state.adminDevices ?? [];
  async function act(action: string, data: unknown) {
    setBusy(true);
    try {
      const result = await mutate(action, data);
      toast.success("Saved");
      return result;
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const preview =
    lat && lng && Number.isFinite(+lat) && Number.isFinite(+lng)
      ? [
          {
            id: "preview",
            name: "New attendance site",
            team: "",
            lat: +lat,
            lng: +lng,
            radius: +radius || 200,
            active: 1,
          },
        ]
      : [];
  const shifts = state.shifts.filter(
    (s) =>
      (!date || new Date(s.started).toLocaleDateString("en-CA") === date) &&
      (team === "All teams" ||
        state.employees.find((e) => e.id === s.employeeId)?.team === team),
  );
  const alerts = state.employees.flatMap((e) => {
    const result: {
      id: string;
      name: string;
      team: string;
      title: string;
      detail: string;
    }[] = [];
    if (!e.shiftStart) return result;
    if (status(e, clock) === "Location stale")
      result.push({
        id: e.id + "stale",
        name: e.name,
        team: e.team,
        title: "Location overdue",
        detail: e.lastSeen
          ? "Last received " + new Date(e.lastSeen).toLocaleTimeString()
          : "No location received this shift",
      });
    if (e.battery !== null && e.battery <= 20)
      result.push({
        id: e.id + "battery",
        name: e.name,
        team: e.team,
        title: "Low battery",
        detail: e.battery + "% at last update",
      });
    if (e.accuracy !== null && e.accuracy > 100)
      result.push({
        id: e.id + "accuracy",
        name: e.name,
        team: e.team,
        title: "Low GPS accuracy",
        detail: "Last fix accurate to ±" + Math.round(e.accuracy) + " m",
      });
    return result;
  });
  function exportAttendance() {
    const rows = [
      [
        "Employee",
        "Team",
        "Clock in",
        "Clock out",
        "Minutes",
        "Attendance site",
      ],
      ...shifts.map((s) => {
        const e = state.employees.find((e) => e.id === s.employeeId);
        return [
          e?.name,
          e?.team,
          new Date(s.started).toISOString(),
          s.ended ? new Date(s.ended).toISOString() : "Active",
          minutes(s.started, s.ended ?? clock),
          s.siteName ?? "Field shift",
        ];
      }),
    ];
    const csv = rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v ?? "")
                .replace(/^[=+@\-]/, "'")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "attendance.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      {page === "Sites & geofences" && (
        <div className="sites-layout">
          <section className="table-panel">
            <div className="panel-heading">
              <div>
                <h2>Attendance sites</h2>
                <p className="subtle">
                  {sites.filter((s) => s.active).length} active · checked at
                  clock-in
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => setDialog("site")}
              >
                <Plus size={16} />
                Add site
              </button>
            </div>
            <div className="site-map">
              <TeamMap
                employees={[]}
                points={[]}
                selected={null}
                onSelect={() => {}}
                now={clock}
                geofences={sites.filter((s) => s.active)}
              />
            </div>
            {sites.length ? (
              sites.map((s) => (
                <div className="site-row" key={s.id}>
                  <div className="site-symbol">
                    <MapPin size={20} />
                  </div>
                  <div className="grow">
                    <h3>{s.name}</h3>
                    <p>
                      {s.team || "All teams"} · {s.radius} m radius
                    </p>
                    <small>
                      {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                    </small>
                  </div>
                  <button
                    className={"button " + (s.active ? "secondary" : "primary")}
                    disabled={busy}
                    onClick={() =>
                      void act("geofence-toggle", {
                        id: s.id,
                        active: !s.active,
                      })
                    }
                  >
                    {s.active ? "Disable" : "Enable"}
                  </button>
                </div>
              ))
            ) : (
              <Blank title="Add your first attendance site">
                Choose the location, radius and team allowed to clock in.
              </Blank>
            )}
          </section>
          <aside className="policy-panel">
            <span className="eyebrow">ATTENDANCE POLICY</span>
            <h2>Clock in at the right place.</h2>
            <p>
              Employees assigned to an active site must be inside its boundary
              to start work.
            </p>
            <div className="policy-line">
              <Check size={18} />
              <span>Fresh GPS fix, less than 60 seconds old</span>
            </div>
            <div className="policy-line">
              <Check size={18} />
              <span>
                Accuracy of 100 metres or better, fully inside the radius
              </span>
            </div>
            <div className="policy-line">
              <Check size={18} />
              <span>Reported mock locations rejected</span>
            </div>
            <hr />
            <p>
              Teams without an active site can start a field shift anywhere.
              Disabling the last site removes that team’s clock-in restriction.
            </p>
            <p>
              Employees can finish work anywhere so location sharing can always
              be stopped.
            </p>
          </aside>
        </div>
      )}
      {page === "Attendance" && (
        <section className="table-panel">
          <div className="panel-heading">
            <div>
              <h2>Shift records</h2>
              <span className="subtle">Latest 1,000 shifts · local time</span>
            </div>
            <button className="button secondary" onClick={exportAttendance}>
              <ArrowDownToLine size={16} />
              Export filtered
            </button>
          </div>
          <div className="operations-filters">
            <label>
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <Choice
              label="Attendance team"
              value={team}
              onChange={setTeam}
              items={[
                "All teams",
                ...new Set(state.employees.map((e) => e.team)),
              ]}
            />
            <button
              className="button secondary"
              onClick={() => {
                setDate("");
                setTeam("All teams");
              }}
            >
              Clear filters
            </button>
            <span className="subtle">
              {shifts.length} shifts ·{" "}
              {duration(
                shifts.reduce(
                  (n, s) => n + minutes(s.started, s.ended ?? clock),
                  0,
                ),
              )}{" "}
              recorded
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Employee",
                  "Clock-in",
                  "Clock-out",
                  "Hours",
                  "Verified site",
                  "Status",
                ].map((v) => (
                  <TableHead key={v}>{v}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <b>
                      {state.employees.find((e) => e.id === s.employeeId)?.name}
                    </b>
                  </TableCell>
                  <TableCell>{new Date(s.started).toLocaleString()}</TableCell>
                  <TableCell>
                    {s.ended ? new Date(s.ended).toLocaleTimeString() : "—"}
                  </TableCell>
                  <TableCell className="numeric">
                    {duration(minutes(s.started, s.ended ?? clock))}
                  </TableCell>
                  <TableCell>
                    {s.siteName ? (
                      <>
                        <span className="verified-site">
                          <ShieldCheck size={15} />
                          {s.siteName}
                        </span>
                        <small className="subtle">
                          GPS ±{Math.round(s.checkinAccuracy ?? 0)} m
                        </small>
                      </>
                    ) : (
                      "Field shift"
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={"status " + (s.ended ? "off-duty" : "on-duty")}
                    >
                      {s.ended ? "Completed" : "Active"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!shifts.length && (
            <Blank title="No shifts for this selection">
              Clock-ins from the employee app will appear here.
            </Blank>
          )}
        </section>
      )}
      {page === "Leave requests" && (
        <section className="table-panel">
          <div className="panel-heading">
            <h2>Time off</h2>
            <Choice
              label="Request status"
              value={filter}
              onChange={setFilter}
              items={["Pending", "Approved", "Declined", "All requests"]}
            />
          </div>
          {leaves
            .filter((l) => filter === "All requests" || l.status === filter)
            .map((l) => (
              <article className="request-row" key={l.id}>
                <div>
                  <div className="request-top">
                    <b>
                      {state.employees.find((e) => e.id === l.employeeId)?.name}
                    </b>
                    <span className={"status " + l.status.toLowerCase()}>
                      {l.status}
                    </span>
                  </div>
                  <h3>
                    {l.kind} leave · {l.startDate} — {l.endDate}
                  </h3>
                  <p>{l.reason}</p>
                  {l.reviewNote && (
                    <p className="notice">Manager: {l.reviewNote}</p>
                  )}
                </div>
                {l.status === "Pending" && (
                  <div className="review-actions">
                    <input
                      aria-label={"Review note for " + l.id}
                      placeholder="Review note (optional)"
                      maxLength={500}
                      value={notes[l.id] ?? ""}
                      onChange={(e) =>
                        setNotes({ ...notes, [l.id]: e.target.value })
                      }
                    />
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void act("leave-review", {
                          id: l.id,
                          status: "Declined",
                          note: notes[l.id] ?? "",
                        })
                      }
                    >
                      Decline
                    </button>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        void act("leave-review", {
                          id: l.id,
                          status: "Approved",
                          note: notes[l.id] ?? "",
                        })
                      }
                    >
                      <Check size={16} />
                      Approve
                    </button>
                  </div>
                )}
              </article>
            ))}
          {!leaves.some(
            (l) => filter === "All requests" || l.status === filter,
          ) && (
            <Blank title="No requests here">
              Leave requests from employees appear here for review.
            </Blank>
          )}
        </section>
      )}
      {page === "Alerts" && (
        <section className="table-panel">
          <div className="panel-heading">
            <h2>Needs attention</h2>
            <span className="subtle">{alerts.length} current exceptions</span>
          </div>
          {alerts.map((a) => (
            <div className="alert-row" key={a.id}>
              <AlertTriangle size={22} />
              <div className="grow">
                <h3>{a.title}</h3>
                <p>
                  {a.name} · {a.team}
                </p>
              </div>
              <span>{a.detail}</span>
            </div>
          ))}
          {!alerts.length && (
            <Blank title="No current exceptions">
              Stale locations, low battery and poor GPS accuracy appear here
              during active shifts.
            </Blank>
          )}
        </section>
      )}
      {page === "Activity log" && (
        <section className="table-panel">
          <div className="panel-heading">
            <h2>Workspace activity</h2>
            <span className="subtle">Latest 200 events</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {["Time", "Actor", "Action", "Subject"].map((s) => (
                  <TableHead key={s}>{s}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(state.audit ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{new Date(a.created).toLocaleString()}</TableCell>
                  <TableCell>{a.actor}</TableCell>
                  <TableCell>{a.action.replaceAll("-", " ")}</TableCell>
                  <TableCell className="subject-cell">{a.subject}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!state.audit?.length && (
            <Blank title="Your activity log starts here">
              Changes to employees, sites, tasks and requests will be recorded.
            </Blank>
          )}
        </section>
      )}
      {page === "Admin devices" && (
        <section className="table-panel">
          <div className="panel-heading">
            <div>
              <h2>Admin mobile access</h2>
              <span className="subtle">
                Separate keys per phone · expires after 30 days
              </span>
            </div>
            <button
              className="button primary"
              onClick={() => setDialog("admin")}
            >
              <Plus size={16} />
              Connect admin
            </button>
          </div>
          {devices.map((d) => (
            <div key={d.id} className="site-row">
              <Smartphone size={24} />
              <div className="grow">
                <h3>{d.label}</h3>
                <p>
                  {d.role === "manager"
                    ? "Manager · can make changes"
                    : "Viewer · read only"}{" "}
                  ·{" "}
                  {d.revoked
                    ? "Revoked"
                    : d.expires < clock
                      ? "Expired"
                      : "Expires " + new Date(d.expires).toLocaleDateString()}
                </p>
              </div>
              {!d.revoked && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void act("admin-revoke", { id: d.id })}
                >
                  Revoke access
                </button>
              )}
            </div>
          ))}
          {!devices.length && (
            <Blank title="Take the workspace with you">
              Install GroSuite Admin, then generate a dedicated access key for
              the phone.
            </Blank>
          )}
        </section>
      )}
      <Dialog
        open={dialog !== null || !!key}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            setKey("");
          }
        }}
      >
        <DialogContent className={dialogKind === "site" ? "site-dialog" : ""}>
          <DialogHeader>
            <DialogTitle>
              {key
                ? "Admin access key"
                : dialogKind === "site"
                  ? "New attendance site"
                  : "Connect an admin phone"}
            </DialogTitle>
            <DialogDescription>
              {key
                ? "Shown once. Enter this in GroSuite Admin alongside your server address."
                : dialogKind === "site"
                  ? "Click the map to position the site, or enter coordinates."
                  : "Choose who can make changes from this phone."}
            </DialogDescription>
          </DialogHeader>
          {key ? (
            <>
              <code className="access-key">{key}</code>
              <button
                className="button primary"
                onClick={() =>
                  navigator.clipboard
                    .writeText(key)
                    .then(() => toast.success("Copied"))
                    .catch(() =>
                      toast.error("Select and copy the key manually"),
                    )
                }
              >
                Copy key
              </button>
            </>
          ) : (
            <form
              className="operations-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = Object.fromEntries(new FormData(e.currentTarget));
                const result = await act(
                  dialogKind === "site" ? "geofence" : "admin-pair",
                  dialogKind === "site"
                    ? { ...form, lat: +lat, lng: +lng, radius: +radius }
                    : form,
                );
                if (result) {
                  setDialog(null);
                  if (result.token) setKey(result.token);
                }
              }}
            >
              {dialogKind === "site" ? (
                <>
                  <label>
                    Site name
                    <input
                      name="name"
                      placeholder="e.g. Chennai office"
                      maxLength={100}
                      required
                    />
                  </label>
                  <label>
                    Team
                    <input
                      name="team"
                      placeholder="Leave empty for all teams"
                      list="site-teams"
                      maxLength={60}
                    />
                    <datalist id="site-teams">
                      {[...new Set(state.employees.map((e) => e.team))].map(
                        (t) => (
                          <option key={t}>{t}</option>
                        ),
                      )}
                    </datalist>
                  </label>
                  <div className="coordinate-fields">
                    <label>
                      Latitude
                      <input
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        required
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                      />
                    </label>
                    <label>
                      Longitude
                      <input
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        required
                        value={lng}
                        onChange={(e) => setLng(e.target.value)}
                      />
                    </label>
                    <label>
                      Radius (m)
                      <input
                        type="number"
                        min="50"
                        max="10000"
                        required
                        value={radius}
                        onChange={(e) => setRadius(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="site-picker">
                    <TeamMap
                      employees={[]}
                      selected={null}
                      points={[]}
                      onSelect={() => {}}
                      now={clock}
                      geofences={preview}
                      onPick={(lat, lng) => {
                        setLat(lat.toFixed(6));
                        setLng(lng.toFixed(6));
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <label>
                    Phone label
                    <input
                      name="label"
                      placeholder="e.g. Operations manager"
                      maxLength={80}
                      required
                    />
                  </label>
                  <label>
                    Access level
                    <select name="role">
                      <option value="viewer">Viewer — read only</option>
                      <option value="manager">
                        Manager — team, tasks and approvals
                      </option>
                    </select>
                  </label>
                </>
              )}
              <button className="button primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : dialogKind === "site"
                    ? "Create site"
                    : "Generate access key"}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
