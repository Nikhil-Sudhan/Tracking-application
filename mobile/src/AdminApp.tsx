import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { FieldMap } from "./FieldMap";
import type { State, Employee, Point } from "./model";
import { status } from "./model";
type Credential = { url: string; token: string };
type Data = State & { access: { label: string; role: string } };
const empty: Data = {
  employees: [],
  tasks: [],
  shifts: [],
  access: { label: "", role: "viewer" },
};
const storage = "grosuite-admin-connection";
const time = (n: number | null) =>
  n
    ? new Date(n).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Never";
export default function AdminApp() {
  const [connection, setConnection] = useState<Credential | null>(null),
    [ready, setReady] = useState(false),
    [url, setUrl] = useState(""),
    [key, setKey] = useState(""),
    [data, setData] = useState<Data>(empty),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Live"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [selected, setSelected] = useState<string | null>(null),
    [points, setPoints] = useState<Point[]>([]),
    [synced, setSynced] = useState<number | null>(null),
    [taskForm, setTaskForm] = useState(false),
    [assignee, setAssignee] = useState(""),
    [title, setTitle] = useState(""),
    [address, setAddress] = useState(""),
    [due, setDue] = useState(""),
    [note, setNote] = useState(""),
    [review, setReview] = useState<string | null>(null);
  const credentialRef = useRef<Credential | null>(null),
    loading = useRef(false);
  const request = useCallback(
    async (
      c: Credential,
      body?: Record<string, unknown>,
      employee?: string,
    ) => {
      const controller = new AbortController(),
        timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const r = await fetch(
          c.url +
            "/api/admin-mobile" +
            (employee ? "?employee=" + encodeURIComponent(employee) : ""),
          {
            method: body ? "POST" : "GET",
            headers: {
              Authorization: "Bearer " + c.token,
              "Content-Type": "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: controller.signal,
          },
        );
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Unable to reach workspace");
        return d;
      } finally {
        clearTimeout(timeout);
      }
    },
    [],
  );
  const refresh = useCallback(async () => {
    const c = credentialRef.current;
    if (!c || loading.current) return;
    loading.current = true;
    try {
      const d = await request(c);
      if (credentialRef.current?.token !== c.token) return;
      setData(d);
      setSynced(Date.now());
      setError("");
    } catch (e) {
      if (credentialRef.current?.token === c.token)
        setError((e as Error).message);
    } finally {
      loading.current = false;
    }
  }, [request]);
  useEffect(() => {
    let mounted = true;
    void SecureStore.getItemAsync(storage)
      .then((v) => {
        if (!mounted) return;
        if (v) {
          const c = JSON.parse(v) as Credential;
          credentialRef.current = c;
          setConnection(c);
          void refresh();
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 15000);
    const sub = AppState.addEventListener("change", (v) => {
      if (v === "active") void refresh();
    });
    return () => {
      mounted = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);
  async function pair() {
    setBusy(true);
    try {
      const origin = new URL(url.trim());
      if (
        origin.protocol !== "https:" &&
        !(__DEV__ && origin.protocol === "http:")
      )
        throw new Error(
          "Use the HTTPS address supplied by your workspace owner.",
        );
      if (
        origin.username ||
        origin.password ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash
      )
        throw new Error("Enter the server origin without a path.");
      if (!/^ga_[a-f0-9]{64}$/.test(key.trim()))
        throw new Error("Paste the complete admin access key.");
      const c = { url: origin.origin, token: key.trim() };
      const d = await request(c);
      await SecureStore.setItemAsync(storage, JSON.stringify(c));
      credentialRef.current = c;
      setConnection(c);
      setData(d);
      setSynced(Date.now());
      setKey("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mutate(body: Record<string, unknown>) {
    if (!connection) return false;
    setBusy(true);
    try {
      await request(connection, body);
      await refresh();
      return true;
    } catch (e) {
      Alert.alert("Could not save", (e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    await SecureStore.deleteItemAsync(storage);
    credentialRef.current = null;
    setConnection(null);
    setData(empty);
    setSelected(null);
    setPoints([]);
    setError("");
  }
  const button = (label: string, action: () => void, secondary = false) => (
    <Pressable
      disabled={busy}
      accessibilityRole="button"
      style={[secondary ? s.secondary : s.button, busy && s.disabled]}
      onPress={action}
    >
      <Text style={secondary ? s.secondaryText : s.buttonText}>{label}</Text>
    </Pressable>
  );
  const field = (
    label: string,
    value: string,
    set: (s: string) => void,
    secure = false,
  ) => (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={value}
        onChangeText={set}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
      />
    </View>
  );
  if (!ready)
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ marginTop: 100 }} color="#17694f" />
      </SafeAreaView>
    );
  const manager = data.access.role === "manager",
    person = data.employees.find((e) => e.id === selected);
  const employees = data.employees.filter(
    (e) =>
      (filter === "All" || status(e) === filter) &&
      (e.name + " " + e.team).toLowerCase().includes(search.toLowerCase()),
  );
  const onDuty = data.employees.filter((e) => !!e.shiftStart).length,
    stale = data.employees.filter((e) => status(e) === "Location stale").length,
    pending = data.leaves?.filter((l) => l.status === "Pending") ?? [];
  function select(id: string) {
    setSelected(id);
    setPoints([]);
  }
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <View>
          <Text style={s.brand}>
            GroSuite <Text style={s.brandLight}>Admin</Text>
          </Text>
          <Text style={s.meta}>
            {connection ? data.access.label : "Field operations"}
          </Text>
        </View>
        {connection && (
          <Pressable
            accessibilityLabel="Admin settings"
            onPress={() => setTab(tab === "Settings" ? "Live" : "Settings")}
            style={s.account}
          >
            <Text style={s.accountText}>
              {data.access.role === "manager" ? "M" : "V"}
            </Text>
          </Pressable>
        )}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
        refreshControl={
          connection ? (
            <RefreshControl
              refreshing={busy}
              onRefresh={() => void refresh()}
              tintColor="#17694f"
            />
          ) : undefined
        }
      >
        {!connection ? (
          <>
            <Text style={s.eyebrow}>ADMIN ACCESS</Text>
            <Text style={s.heading}>Connect your workspace</Text>
            <Text style={s.body}>
              Connect this phone using an access key from Admin devices in your
              website.
            </Text>
            <View style={s.card}>
              {field("Server address", url, setUrl)}
              {field("Admin access key", key, setKey, true)}
              {button(
                busy ? "Connecting…" : "Connect workspace",
                () => void pair(),
              )}
              <Text style={s.meta}>
                Admin access does not track this phone’s location.
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={s.pageTitle}>
              <Text style={s.heading}>
                {tab === "Live" ? "In the field" : tab}
              </Text>
              <Text style={s.meta}>
                {synced ? "Updated " + time(synced) : "Waiting for sync"}
              </Text>
            </View>
            {tab === "Live" && (
              <>
                <View style={s.metrics}>
                  {[
                    [onDuty, "On duty"],
                    [stale, "Stale GPS"],
                    [pending.length, "Requests"],
                  ].map(([v, l]) => (
                    <View style={s.metric} key={l}>
                      <Text style={s.metricValue}>{v}</Text>
                      <Text style={s.meta}>{l}</Text>
                    </View>
                  ))}
                </View>
                <FieldMap
                  origin={connection.url}
                  employees={employees}
                  sites={data.geofences ?? []}
                  points={points}
                  selected={selected}
                  onSelect={select}
                />
                {person && (
                  <View style={s.card}>
                    <View style={s.spread}>
                      <Text style={s.title}>{person.name}</Text>
                      <Text style={s.tag}>{status(person)}</Text>
                    </View>
                    <Text style={s.body}>
                      {person.team} · GPS ±{person.accuracy ?? "—"} m · Battery{" "}
                      {person.battery ?? "—"}%
                    </Text>
                    <Text style={s.meta}>
                      Last seen {time(person.lastSeen)} ·{" "}
                      {person.lat?.toFixed(5) ?? "No fix"},{" "}
                      {person.lng?.toFixed(5) ?? ""}
                    </Text>
                    {button(
                      "View last 24 hours",
                      () => {
                        void request(connection, undefined, person.id)
                          .then((d) => {
                            if (
                              credentialRef.current?.token !== connection.token
                            )
                              return;
                            setPoints(d.points);
                            if (!d.points.length)
                              Alert.alert(
                                "No route yet",
                                "No points recorded in the last 24 hours.",
                              );
                          })
                          .catch((e) =>
                            Alert.alert("Route unavailable", e.message),
                          );
                      },
                      true,
                    )}
                  </View>
                )}
                <TextInput
                  style={s.search}
                  placeholder="Search employee or team"
                  placeholderTextColor="#718379"
                  value={search}
                  onChangeText={setSearch}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.chips}
                >
                  {["All", "On duty", "Location stale", "Off duty"].map((v) => (
                    <Pressable
                      key={v}
                      style={[s.chip, filter === v && s.chipActive]}
                      onPress={() => setFilter(v)}
                    >
                      <Text
                        style={filter === v ? s.buttonText : s.secondaryText}
                      >
                        {v}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {employees.map((e) => (
                  <Pressable
                    key={e.id}
                    style={[s.employee, e.id === selected && s.selected]}
                    onPress={() => select(e.id)}
                  >
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>
                        {e.name
                          .split(" ")
                          .map((x) => x[0])
                          .slice(0, 2)
                          .join("")}
                      </Text>
                    </View>
                    <View style={s.grow}>
                      <Text style={s.title}>{e.name}</Text>
                      <Text style={s.meta}>
                        {e.team} · {status(e)}
                      </Text>
                    </View>
                    <Text style={s.meta}>{time(e.lastSeen)}</Text>
                  </Pressable>
                ))}
                {!employees.length && (
                  <Text style={s.empty}>
                    No employees in this view. Add your team from the website.
                  </Text>
                )}
              </>
            )}
            {tab === "Attendance" && (
              <>
                <Text style={s.body}>Recent shifts · local time</Text>
                {data.shifts.slice(0, 100).map((h) => (
                  <View key={h.id} style={s.card}>
                    <View style={s.spread}>
                      <Text style={s.title}>
                        {
                          data.employees.find((e) => e.id === h.employeeId)
                            ?.name
                        }
                      </Text>
                      <Text style={s.tag}>
                        {h.ended
                          ? Math.round((h.ended - h.started) / 60000) + " min"
                          : "Active"}
                      </Text>
                    </View>
                    <Text style={s.body}>
                      {new Date(h.started).toLocaleDateString()} ·{" "}
                      {time(h.started)} — {h.ended ? time(h.ended) : "Working"}
                    </Text>
                    <Text style={s.meta}>
                      {h.siteName ? "Verified at " + h.siteName : "Field shift"}
                    </Text>
                  </View>
                ))}
                {!data.shifts.length && (
                  <Text style={s.empty}>No attendance records yet.</Text>
                )}
              </>
            )}
            {tab === "Tasks" && (
              <>
                {manager &&
                  button("Assign a task", () => {
                    setAssignee(data.employees[0]?.id ?? "");
                    setTaskForm(true);
                  })}
                {data.tasks.map((t) => (
                  <View style={s.card} key={t.id}>
                    <Text style={s.tag}>{t.status}</Text>
                    <Text style={s.title}>{t.title}</Text>
                    <Text style={s.body}>{t.address}</Text>
                    <Text style={s.meta}>
                      {data.employees.find((e) => e.id === t.employeeId)?.name}{" "}
                      · Due {t.due}
                    </Text>
                    {manager &&
                      t.status !== "Completed" &&
                      button(
                        t.status === "Assigned"
                          ? "Start task"
                          : "Complete task",
                        () =>
                          void mutate({
                            action: "task-status",
                            id: t.id,
                            status:
                              t.status === "Assigned"
                                ? "In progress"
                                : "Completed",
                          }),
                        true,
                      )}
                  </View>
                ))}
                {!data.tasks.length && (
                  <Text style={s.empty}>No tasks assigned yet.</Text>
                )}
              </>
            )}
            {tab === "Requests" && (
              <>
                {(data.leaves ?? []).map((l) => (
                  <View style={s.card} key={l.id}>
                    <View style={s.spread}>
                      <Text style={s.title}>
                        {
                          data.employees.find((e) => e.id === l.employeeId)
                            ?.name
                        }
                      </Text>
                      <Text style={s.tag}>{l.status}</Text>
                    </View>
                    <Text style={s.body}>
                      {l.kind} · {l.startDate} — {l.endDate}
                    </Text>
                    <Text style={s.body}>{l.reason}</Text>
                    {!!l.reviewNote && (
                      <Text style={s.meta}>Review: {l.reviewNote}</Text>
                    )}
                    {manager &&
                      l.status === "Pending" &&
                      (review === l.id ? (
                        <>
                          {field("Review note (optional)", note, setNote)}
                          <View style={s.spread}>
                            {button(
                              "Decline",
                              () =>
                                void mutate({
                                  action: "leave-review",
                                  id: l.id,
                                  status: "Declined",
                                  note,
                                }),
                              true,
                            )}
                            {button(
                              "Approve",
                              () =>
                                void mutate({
                                  action: "leave-review",
                                  id: l.id,
                                  status: "Approved",
                                  note,
                                }),
                            )}
                          </View>
                        </>
                      ) : (
                        button(
                          "Review request",
                          () => {
                            setReview(l.id);
                            setNote("");
                          },
                          true,
                        )
                      ))}
                  </View>
                ))}
                {!data.leaves?.length && (
                  <Text style={s.empty}>No leave requests yet.</Text>
                )}
              </>
            )}
            {tab === "Settings" && (
              <>
                <View style={s.card}>
                  <Text style={s.title}>Workspace connection</Text>
                  <Text style={s.body}>{connection.url}</Text>
                  <Text style={s.meta}>
                    Access: {data.access.role}. Keys expire after 30 days and
                    can be revoked from the website.
                  </Text>
                  {button("Refresh workspace", () => void refresh(), true)}
                  {button(
                    "Disconnect this phone",
                    () =>
                      Alert.alert(
                        "Disconnect admin app?",
                        "You will need a valid admin key to reconnect.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Disconnect",
                            style: "destructive",
                            onPress: () => void disconnect(),
                          },
                        ],
                      ),
                    true,
                  )}
                </View>
                <View style={s.card}>
                  <Text style={s.title}>Attendance sites</Text>
                  {(data.geofences ?? []).map((g) => (
                    <Text key={g.id} style={s.body}>
                      {g.name} · {g.radius} m ·{" "}
                      {g.active ? "Active" : "Disabled"}
                    </Text>
                  ))}
                  {!data.geofences?.length && (
                    <Text style={s.body}>
                      No sites configured. Add attendance sites on the website.
                    </Text>
                  )}
                </View>
              </>
            )}
          </>
        )}
        {!!error && (
          <View style={s.error}>
            <Text style={s.errorTitle}>Connection needs attention</Text>
            <Text style={s.body}>{error}</Text>
            {connection && (
              <Text style={s.meta}>
                Showing the last received data. Pull down to retry.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
      {connection && (
        <View style={s.tabs}>
          {["Live", "Attendance", "Tasks", "Requests"].map((t) => (
            <Pressable
              key={t}
              style={[s.tab, tab === t && s.tabSelected]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
            >
              <Text style={[s.tabText, tab === t && s.tabTextSelected]}>
                {t}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <Modal
        visible={taskForm}
        animationType="slide"
        onRequestClose={() => setTaskForm(false)}
      >
        <SafeAreaView style={s.safe}>
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.heading}>Assign task</Text>
            <Text style={s.label}>Employee</Text>
            <View style={s.chips}>
              {data.employees.map((e) => (
                <Pressable
                  key={e.id}
                  style={[s.chip, assignee === e.id && s.chipActive]}
                  onPress={() => setAssignee(e.id)}
                >
                  <Text
                    style={assignee === e.id ? s.buttonText : s.secondaryText}
                  >
                    {e.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            {field("Task title", title, setTitle)}
            {field("Address", address, setAddress)}
            {field("Due date · YYYY-MM-DD", due, setDue)}
            {button("Assign task", () => {
              void mutate({
                action: "task",
                employeeId: assignee,
                title,
                address,
                due,
              }).then((ok) => {
                if (ok) {
                  setTaskForm(false);
                  setTitle("");
                  setAddress("");
                  setDue("");
                }
              });
            })}
            {button("Cancel", () => setTaskForm(false), true)}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f5f7f6",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0,
  },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#dce4df",
    backgroundColor: "white",
  },
  brand: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -1,
    color: "#183c2e",
  },
  brandLight: { fontWeight: "400" },
  meta: { fontSize: 13, color: "#6d7d74", lineHeight: 20 },
  account: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#193d2e",
    alignItems: "center",
    justifyContent: "center",
  },
  accountText: { color: "white", fontWeight: "700" },
  content: { padding: 20, paddingBottom: 35, gap: 16 },
  eyebrow: {
    fontSize: 12,
    color: "#17694f",
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 28,
  },
  heading: {
    fontSize: 29,
    fontWeight: "700",
    letterSpacing: -0.8,
    color: "#18372c",
  },
  pageTitle: { gap: 5 },
  body: { fontSize: 16, lineHeight: 24, color: "#455e50" },
  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dbe4de",
    borderRadius: 12,
    padding: 18,
    gap: 12,
  },
  field: { gap: 8, marginBottom: 4 },
  label: { fontSize: 14, fontWeight: "600", color: "#405d4b" },
  input: {
    borderWidth: 1,
    borderColor: "#c6d3ca",
    borderRadius: 7,
    padding: 12,
    fontSize: 16,
    color: "#193d2e",
  },
  button: {
    backgroundColor: "#17694f",
    padding: 14,
    borderRadius: 7,
    alignItems: "center",
  },
  buttonText: { color: "white", fontSize: 14, fontWeight: "600" },
  secondary: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#cbd8ce",
    borderRadius: 7,
    alignItems: "center",
  },
  secondaryText: { fontSize: 14, fontWeight: "600", color: "#28553d" },
  disabled: { opacity: 0.5 },
  metrics: {
    flexDirection: "row",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dbe4de",
    borderRadius: 12,
    padding: 18,
  },
  metric: { flex: 1, alignItems: "center", gap: 4 },
  metricValue: { fontSize: 28, fontWeight: "600", color: "#18372c" },
  spread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  title: { fontSize: 17, fontWeight: "600", color: "#1c3c2d" },
  tag: { fontSize: 13, color: "#17694f", fontWeight: "600" },
  search: {
    backgroundColor: "white",
    padding: 13,
    borderWidth: 1,
    borderColor: "#d3dfd7",
    borderRadius: 8,
    fontSize: 16,
    color: "#193d2e",
  },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: "#e8eeea",
  },
  chipActive: { backgroundColor: "#17694f" },
  employee: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: "#e1e8e3",
    borderRadius: 8,
  },
  selected: { borderWidth: 1, borderColor: "#17694f" },
  avatar: {
    width: 40,
    height: 40,
    backgroundColor: "#e6efe9",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#17694f", fontWeight: "700" },
  grow: { flex: 1 },
  empty: {
    padding: 24,
    textAlign: "center",
    color: "#6d7d74",
    fontSize: 16,
    lineHeight: 24,
  },
  error: {
    backgroundColor: "#fff1df",
    borderWidth: 1,
    borderColor: "#e8ceaa",
    borderRadius: 8,
    padding: 16,
    gap: 8,
  },
  errorTitle: { fontSize: 16, fontWeight: "600", color: "#805318" },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#dce4df",
    backgroundColor: "white",
    padding: 8,
    gap: 4,
  },
  tab: { flex: 1, paddingVertical: 15, alignItems: "center", borderRadius: 6 },
  tabSelected: { backgroundColor: "#e7f1eb" },
  tabText: { fontSize: 12, fontWeight: "600", color: "#6d7d74" },
  tabTextSelected: { color: "#17694f" },
});
