import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import {
  active,
  credentials,
  getValue,
  queueCount,
  saveCredentials,
  setValue,
  db,
  type Session,
} from "./src/store";
import { api, endShift, LOCATION_TASK, startShift, sync } from "./src/tracking";
type Task = {
  id: string;
  title: string;
  address: string;
  due: string;
  status: string;
};
export default function App() {
  const [paired, setPaired] = useState(false),
    [repairMode, setRepairMode] = useState(false),
    [url, setUrl] = useState(""),
    [key, setKey] = useState(""),
    [name, setName] = useState(""),
    [session, setSession] = useState<Session | null>(null),
    [tasks, setTasks] = useState<Task[]>([]),
    [pending, setPending] = useState(0),
    [lastSync, setLastSync] = useState<number | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setSession(await active());
      setPending(await queueCount());
      setLastSync(await getValue<number>("lastSync"));
      setError(
        (await getValue<string>("syncError")) ??
          (await getValue<string>("syncNotice")) ??
          "",
      );
      if (await credentials()) {
        setPaired(true);
        const data = await api();
        setName(data.employee.name);
        setTasks(data.tasks);
        const current = await active();
        if (
          current &&
          !(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
        )
          setError(
            "Location sharing was interrupted. Tap Resume shift to restart it.",
          );
        if (data.shift && !current)
          setError(
            "Your server shift is still open. Resume it or end it from this device.",
          );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        sync()
          .catch(() => {})
          .finally(refresh);
      }
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [refresh]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setError("");
    } catch (e) {
      setError((e as Error).message);
      Alert.alert("Action could not finish", (e as Error).message);
    } finally {
      setBusy(false);
      await refresh();
    }
  }
  async function pair() {
    const parsed = new URL(url.trim());
    if (
      parsed.protocol !== "https:" &&
      !(__DEV__ && parsed.protocol === "http:")
    )
      throw new Error("Use an HTTPS API address.");
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    )
      throw new Error(
        "Enter the API origin only, without a path or credentials.",
      );
    if (!/^fp_[a-f0-9]{64}$/.test(key.trim()))
      throw new Error("Enter the full device key from your administrator.");
    const candidate = { url: parsed.origin, token: key.trim() };
    try {
      const data = await api(undefined, candidate);
      const previous = await getValue<string>("employeeId");
      const pendingStops = await (
        await db()
      ).getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM pending_stops");
      if (
        previous &&
        previous !== data.employee.id &&
        ((await active()) ||
          (await queueCount()) > 0 ||
          (pendingStops?.n ?? 0) > 0)
      )
        throw new Error(
          "Sync and end the previous employee’s shift before changing accounts.",
        );
      await saveCredentials(candidate);
      await setValue("employeeId", data.employee.id);
      setName(data.employee.name);
      setPaired(true);
      setRepairMode(false);
      setKey("");
    } catch (e) {
      throw e;
    }
  }
  if (!ready)
    return (
      <SafeAreaView style={s.safe}>
        <Text style={s.loading}>Opening GroSuite Field…</Text>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={s.page}
        refreshControl={
          <RefreshControl
            refreshing={busy}
            onRefresh={() =>
              act(async () => {
                await sync();
                await refresh();
              })
            }
            tintColor="#df8756"
          />
        }
      >
        <View style={s.header}>
          <Text style={s.logo}>
            GroSuite<Text style={s.orange}> Field</Text>
          </Text>
          <Text style={s.headerNote}>EMPLOYEE APP</Text>
        </View>
        {!paired || repairMode ? (
          <>
            <Text style={s.title}>Connect your device</Text>
            <Text style={s.subtitle}>
              Enter the API address and private device key provided by your
              administrator.
            </Text>
            <View style={s.card}>
              <Text style={s.label}>Workspace API address</Text>
              <TextInput
                style={s.input}
                value={url}
                onChangeText={setUrl}
                placeholder="https://api.yourcompany.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={s.label}>Device key</Text>
              <TextInput
                style={s.input}
                value={key}
                onChangeText={setKey}
                placeholder="fp_…"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                disabled={busy}
                style={s.button}
                onPress={() => act(pair)}
              >
                <Text style={s.buttonText}>
                  {busy ? "Connecting…" : "Connect device"}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={s.greeting}>Hello, {name || "teammate"}</Text>
            <Text style={s.title}>Your shift</Text>
            <View style={s.shiftCard}>
              <Text style={s.overline}>
                {session ? "SHIFT ACTIVE" : "YOU’RE OFF DUTY"}
              </Text>
              <Text style={s.shiftTitle}>
                {session ? "Location sharing is on" : "Location sharing is off"}
              </Text>
              <Text style={s.shiftDescription}>
                {session
                  ? `Started at ${new Date(session.started).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Your manager can see your work location.`
                  : "Start a shift to share your work location. Tracking stops when you end your shift."}
              </Text>
              <Pressable
                disabled={busy}
                style={[s.button, session && s.endButton]}
                onPress={() => {
                  if (session) act(endShift);
                  else
                    Alert.alert(
                      "Share location during your shift",
                      "GroSuite Field collects your location while on duty, including in the background, and shares it with your administrator. You can stop by ending your shift. Android will show a notification; iOS will show a location indicator.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Start shift", onPress: () => act(startShift) },
                      ],
                    );
                }}
              >
                <Text style={s.buttonText}>
                  {busy
                    ? "Please wait…"
                    : session
                      ? "End shift"
                      : "Start my shift"}
                </Text>
              </Pressable>
            </View>
            <View style={s.syncRow}>
              <Text style={s.syncText}>
                {pending} locations waiting to sync
              </Text>
              <Pressable onPress={() => act(sync)} disabled={busy}>
                <Text style={s.link}>Sync now</Text>
              </Pressable>
            </View>
            <Text style={s.lastSync}>
              {lastSync
                ? "Last synced " + new Date(lastSync).toLocaleTimeString()
                : "No locations synced yet"}
            </Text>
            <View style={s.sectionTitle}>
              <Text style={s.sectionHeading}>Your assignments</Text>
              <Text style={s.count}>{tasks.length}</Text>
            </View>
            {tasks.length ? (
              tasks.map((t) => (
                <View key={t.id} style={s.card}>
                  <Text style={s.taskStatus}>{t.status.toUpperCase()}</Text>
                  <Text style={s.taskTitle}>{t.title}</Text>
                  <Text style={s.taskAddress}>⌖ {t.address}</Text>
                  <Text style={s.taskAddress}>Due {t.due}</Text>
                  {t.status !== "Completed" && (
                    <Pressable
                      disabled={busy}
                      style={s.taskButton}
                      onPress={() =>
                        act(() =>
                          api({
                            action: "task-status",
                            id: t.id,
                            status:
                              t.status === "Assigned"
                                ? "In progress"
                                : "Completed",
                          }),
                        )
                      }
                    >
                      <Text style={s.link}>
                        {t.status === "Assigned"
                          ? "Start task"
                          : "Mark complete"}{" "}
                        →
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))
            ) : (
              <View style={s.card}>
                <Text style={s.emptyText}>
                  No assignments yet. New tasks from your manager will appear
                  here.
                </Text>
              </View>
            )}
          </>
        )}
        {!!error && (
          <View style={s.error}>
            <Text style={s.errorText}>{error}</Text>
            {paired && (
              <>
                <Pressable onPress={() => act(startShift)} disabled={busy}>
                  <Text style={s.link}>Resume shift</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    act(async () => {
                      const data = await api();
                      if (data.shift) {
                        await api({
                          action: "stop",
                          shiftId: data.shift.id,
                          ended: Math.max(data.shift.started, Date.now()),
                        });
                      }
                      await endShift();
                    })
                  }
                  disabled={busy}
                >
                  <Text style={s.link}>End open shift</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
        <View style={s.privacy}>
          <Text style={s.privacyTitle}>Location sharing</Text>
          <Text style={s.privacyText}>
            Location permission is used only for your active work shift. Offline
            locations stay on this device until they can sync. You can review
            permissions in device settings.
          </Text>
          <Pressable onPress={() => Linking.openSettings()}>
            <Text style={s.settingsLink}>Open device settings</Text>
          </Pressable>
          {paired && (
            <Pressable
              disabled={!!session || busy}
              onPress={() => setRepairMode(true)}
            >
              <Text style={s.settingsLink}>Update workspace or device key</Text>
            </Pressable>
          )}
        </View>
        <Text style={s.footer}>
          {Platform.OS === "ios" ? "iOS" : "Android"} · GroSuite Field employee
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0b1120" },
  page: { padding: 24, paddingTop: 20, paddingBottom: 45 },
  loading: { color: "#fff", padding: 30 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 38,
  },
  logo: { fontSize: 25, fontWeight: "700", color: "#fff", letterSpacing: -1 },
  orange: { color: "#ed8851" },
  headerNote: { color: "#8da3ad", fontSize: 10, letterSpacing: 1 },
  title: {
    fontSize: 31,
    lineHeight: 40,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: -0.8,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 26,
    color: "#9fb2ba",
    marginBottom: 24,
  },
  greeting: { fontSize: 15, color: "#9bb0ba", marginBottom: 9 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 22,
    marginBottom: 15,
  },
  label: { fontSize: 14, color: "#667f8b", marginBottom: 9 },
  input: {
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#dce4e8",
    borderRadius: 7,
    padding: 12,
    marginBottom: 22,
    color: "#1c3541",
  },
  button: {
    backgroundColor: "#2a6df4",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  shiftCard: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 24,
    marginTop: 15,
  },
  overline: {
    fontSize: 12,
    color: "#bf805a",
    letterSpacing: 1.4,
    fontWeight: "600",
  },
  shiftTitle: {
    fontSize: 23,
    fontWeight: "600",
    color: "#233d49",
    marginTop: 14,
  },
  shiftDescription: {
    fontSize: 15,
    lineHeight: 25,
    color: "#7e939d",
    marginTop: 12,
    marginBottom: 10,
  },
  endButton: { backgroundColor: "#223d49" },
  syncRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
    gap: 12,
  },
  syncText: { fontSize: 12, color: "#b3c2c9" },
  link: {
    fontSize: 14,
    fontWeight: "600",
    color: "#d47b47",
    paddingVertical: 6,
  },
  lastSync: { fontSize: 12, color: "#829ba7", marginTop: 4 },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 32,
    marginBottom: 16,
  },
  sectionHeading: { fontSize: 20, color: "#fff", fontWeight: "600" },
  count: { fontSize: 14, color: "#b6c5cb" },
  taskStatus: {
    fontSize: 11,
    color: "#bb865f",
    letterSpacing: 1,
    fontWeight: "600",
    marginBottom: 12,
  },
  taskTitle: {
    fontSize: 19,
    fontWeight: "600",
    color: "#243e49",
    lineHeight: 28,
  },
  taskAddress: { fontSize: 14, color: "#8396a0", marginTop: 9 },
  taskButton: {
    borderTopWidth: 1,
    borderTopColor: "#edf0f2",
    marginTop: 18,
    paddingTop: 9,
  },
  emptyText: { color: "#889ba5", fontSize: 15, lineHeight: 25 },
  error: {
    backgroundColor: "#fbefe5",
    padding: 18,
    borderRadius: 10,
    marginTop: 18,
  },
  errorText: {
    color: "#a66d45",
    fontSize: 14,
    lineHeight: 23,
    marginBottom: 6,
  },
  privacy: {
    borderTopWidth: 1,
    borderTopColor: "#334b57",
    marginTop: 30,
    paddingTop: 25,
  },
  privacyTitle: { color: "#c7d5db", fontSize: 15, fontWeight: "600" },
  privacyText: {
    color: "#8ea5b1",
    fontSize: 13,
    lineHeight: 23,
    marginTop: 10,
  },
  settingsLink: { fontSize: 13, color: "#db9a72", marginTop: 16 },
  footer: {
    color: "#698592",
    fontSize: 12,
    textAlign: "center",
    marginTop: 35,
  },
});
