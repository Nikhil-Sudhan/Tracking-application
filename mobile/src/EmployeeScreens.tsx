import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {Records, type RecordsData} from "./Records";
import type { Session } from "./store";

type Task = {
  id: string;
  title: string;
  address: string;
  due: string;
  status: string;
};
type Props = {
  records?: RecordsData;
  onLeave?: (body:Record<string,unknown>)=>Promise<boolean>;
  ready: boolean;
  paired: boolean;
  repairMode: boolean;
  busy: boolean;
  name: string;
  session: Session | null;
  tasks: Task[];
  pending: number;
  lastSync: number | null;
  error: string;
  needsRecovery: boolean;
  url: string;
  deviceKey: string;
  setUrl: (value: string) => void;
  setKey: (value: string) => void;
  setRepairMode: (value: boolean) => void;
  pair: () => void;
  start: () => void;
  finish: () => void;
  sync: () => void;
  recoverFinish: () => void;
  updateTask: (task: Task) => void;
};

export function EmployeeScreens(p: Props) {
  const [tab, setTab] = useState<"work" | "tasks" | "records" | "help">("work");
  const [showSetup, setShowSetup] = useState(false);
  const working = !!p.session;
  const openTasks = p.tasks.filter((task) => task.status !== "Completed");
  const requestStart = () =>
    Alert.alert(
      "Share your location while working?",
      "Your manager can see your location during work, even when this app is in the background or your screen is locked. Tap Finish work to stop sharing.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Start work", onPress: p.start },
      ],
    );
  const requestFinish = () =>
    Alert.alert(
      "Finished for today?",
      "This will stop sharing your location with your manager.",
      [
        { text: "Keep working", style: "cancel" },
        { text: "Finish work", onPress: p.finish },
      ],
    );
  const button = (
    label: string,
    onPress: () => void,
    secondary = false,
    disabled = p.busy,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[secondary ? s.secondaryButton : s.button, disabled && s.disabled]}
      onPress={onPress}
    >
      <Text style={secondary ? s.secondaryText : s.buttonText}>{label}</Text>
    </Pressable>
  );
  if (!p.ready)
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loading}>
          <ActivityIndicator size="large" color="#17694f" />
          <Text style={s.body}>Opening your day…</Text>
        </View>
      </SafeAreaView>
    );
  const setup = !p.paired || p.repairMode;
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <View>
          <Text style={s.logo}>
            GroSuite <Text style={s.brandAccent}>Field</Text>
          </Text>
          <Text style={s.headerNote}>Employee workspace</Text>
        </View>
        {p.paired && (
          <View style={[s.badge, working && s.activeBadge]}>
            <Text style={s.badgeText}>{working ? "Working" : "Off duty"}</Text>
          </View>
        )}
      </View>
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={p.busy}
            onRefresh={p.sync}
            tintColor="#17694f"
          />
        }
      >
        {setup ? (
          <>
            <Text style={s.eyebrow}>WELCOME</Text>
            <Text style={s.title}>Let’s get you ready.</Text>
            <Text style={s.subtitle}>
              Ask your manager to connect this phone. You only need to do this
              once.
            </Text>
            <View style={s.card}>
              <Text style={s.cardTitle}>Three simple steps</Text>
              <Text style={s.step}>1. Start work when your day begins.</Text>
              <Text style={s.step}>2. Check tasks from your manager.</Text>
              <Text style={s.step}>
                3. Finish work to stop location sharing.
              </Text>
            </View>
            {showSetup || p.repairMode ? (
              <View style={s.card}>
                <Text style={s.cardTitle}>Connect to your company</Text>
                <Text style={s.body}>
                  Your manager provides both details below.
                </Text>
                <Text style={s.label}>Company address</Text>
                <TextInput
                  accessibilityLabel="Company address"
                  style={s.input}
                  value={p.url}
                  onChangeText={p.setUrl}
                  placeholder="https://your-company-address"
                  placeholderTextColor="#697b73"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Text style={s.label}>Setup code</Text>
                <TextInput
                  accessibilityLabel="Setup code"
                  style={s.input}
                  value={p.deviceKey}
                  onChangeText={p.setKey}
                  placeholder="Paste the code from your manager"
                  placeholderTextColor="#697b73"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {button(p.busy ? "Connecting…" : "Connect my phone", p.pair)}
              </View>
            ) : (
              button("Set up this phone", () => setShowSetup(true))
            )}
            {p.repairMode &&
              button("Back to my day", () => p.setRepairMode(false), true)}
          </>
        ) : tab === "work" ? (
          <>
            <Text style={s.eyebrow}>
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </Text>
            <Text style={s.title}>
              Hello{p.name ? `, ${p.name.split(" ")[0]}` : ""}.
            </Text>
            <Text style={s.subtitle}>
              {working
                ? "You’re checked in. Have a good day."
                : "Ready for your workday?"}
            </Text>
            <View style={[s.workCard, working && s.workingCard]}>
              <View style={s.statusCircle}>
                <Text style={s.statusSymbol}>{working ? "✓" : "○"}</Text>
              </View>
              <Text style={s.workTitle}>
                {working ? "You’re at work" : "You’re off duty"}
              </Text>
              <Text style={s.workDescription}>
                {p.session
                  ? `Started at ${new Date(p.session.started).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Your manager can see your work location.`
                  : "Your location is not being shared. Tap below when you’re ready to begin."}
              </Text>
              {button(
                p.busy ? "One moment…" : working ? "Finish work" : "Start work",
                working ? requestFinish : requestStart,
              )}
              <Text style={s.smallNote}>
                {working
                  ? "Finish work when your day is done."
                  : "Location is shared only while you’re working."}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              style={s.taskSummary}
              onPress={() => setTab("tasks")}
            >
              <View style={s.flex}>
                <Text style={s.cardTitle}>My tasks</Text>
                <Text style={s.body}>
                  {openTasks.length
                    ? `${openTasks.length} to do · Tap to view`
                    : "Nothing waiting for you"}
                </Text>
              </View>
              <Text style={s.arrow}>→</Text>
            </Pressable>
            {!!p.pending && (
              <Text style={s.notice}>
                Your updates are saved on this phone. They’ll be sent when
                you’re connected.
              </Text>
            )}
          </>
        ) : tab === "records" ? (<Records data={p.records??{sites:[],history:[],leaves:[]}} busy={p.busy} onLeave={p.onLeave??(async()=>false)}/>) : tab === "tasks" ? (
          <>
            <Text style={s.eyebrow}>YOUR DAY</Text>
            <Text style={s.title}>My tasks</Text>
            <Text style={s.subtitle}>
              See what needs doing. Tap a task’s button when you’re ready.
            </Text>
            {p.tasks.length ? (
              p.tasks.map((task) => (
                <View key={task.id} style={s.card}>
                  <Text style={s.taskStatus}>
                    {task.status === "Assigned"
                      ? "TO DO"
                      : task.status === "Completed"
                        ? "DONE"
                        : "IN PROGRESS"}
                  </Text>
                  <Text style={s.cardTitle}>{task.title}</Text>
                  {!!task.address && <Text style={s.body}>{task.address}</Text>}
                  {!!task.due && <Text style={s.due}>Due: {task.due}</Text>}
                  {task.status !== "Completed" &&
                    button(
                      p.busy
                        ? "One moment…"
                        : task.status === "Assigned"
                          ? "Start this task"
                          : "Mark as done",
                      () => p.updateTask(task),
                    )}
                </View>
              ))
            ) : (
              <View style={s.card}>
                <Text style={s.cardTitle}>No assigned tasks</Text>
                <Text style={s.body}>
                  Tasks from your manager will appear here. You can still start
                  your workday.
                </Text>
                {button("Back to my day", () => setTab("work"), true)}
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={s.eyebrow}>SETTINGS & SUPPORT</Text>
            <Text style={s.title}>Settings</Text>
            <View style={s.card}>
              <Text style={s.cardTitle}>How to use this app</Text>
              <Text style={s.step}>1. On My day, tap Start work.</Text>
              <Text style={s.step}>2. Allow location access when asked.</Text>
              <Text style={s.step}>3. Open My tasks to see your work.</Text>
              <Text style={s.step}>4. Tap Finish work when you’re done.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>You control location sharing</Text>
              <Text style={s.body}>
                Your manager sees your location only during work, including when
                your screen is locked. Finish work to stop sharing.
              </Text>
              {button(
                "Location settings",
                () => {
                  void Linking.openSettings();
                },
                true,
              )}
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Connection</Text>
              <Text style={s.body}>
                {p.pending
                  ? `${p.pending} updates saved on this phone, waiting to send.`
                  : "No location updates waiting to send."}
              </Text>
              <Text style={s.due}>
                {p.lastSync
                  ? `Last sent: ${new Date(p.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "No updates sent yet."}
              </Text>
              {button(p.busy ? "Sending…" : "Send saved updates", p.sync, true)}
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Manager setup</Text>
              <Text style={s.body}>
                {working
                  ? "Finish work before changing this phone’s setup."
                  : "Ask your manager for help if you need to connect to a different account."}
              </Text>
              {button(
                "Change phone setup",
                () => p.setRepairMode(true),
                true,
                working || p.busy,
              )}
            </View>
          </>
        )}
        {!!p.error && (
          <View style={s.error}>
            <Text style={s.errorTitle}>Something needs attention</Text>
            <Text style={s.errorText}>{p.error}</Text>
            {p.paired && p.needsRecovery && (
              <>
                {button("Continue my workday", requestStart, true)}
                {button("Finish this workday", p.recoverFinish, true)}
              </>
            )}
            {p.paired &&
              tab !== "help" &&
              button("Get help", () => setTab("help"), true, false)}
          </View>
        )}
      </ScrollView>
      {p.paired && !p.repairMode && (
        <View style={s.tabs}>
          {(
            [
              ["work", "My day"],
              ["tasks", "My tasks"],
              ["records", "Records"],
              ["help", "Help"],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === id }}
              style={[s.tab, tab === id && s.selectedTab]}
              onPress={() => setTab(id)}
            >
              <Text style={[s.tabText, tab === id && s.selectedTabText]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f6f8f5",
    paddingTop:
      Platform.OS === "android" ? (NativeStatusBar.currentHeight ?? 24) : 0,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20 },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  logo: {
    color: "#203b30",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  brandAccent: { color: "#287657", fontWeight: "500" },
  headerNote: { color: "#66776d", fontSize: 13, marginTop: 4 },
  badge: {
    backgroundColor: "#e7ebe5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  activeBadge: { backgroundColor: "#dcefe3" },
  badgeText: { color: "#315b43", fontSize: 13, fontWeight: "700" },
  page: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 30 },
  eyebrow: {
    color: "#62796b",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  title: {
    color: "#1c352a",
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: -1,
  },
  subtitle: {
    color: "#5d7164",
    fontSize: 17,
    lineHeight: 26,
    marginTop: 8,
    marginBottom: 26,
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e1e8df",
    borderRadius: 20,
    padding: 22,
    marginBottom: 16,
  },
  cardTitle: {
    color: "#213c2f",
    fontSize: 21,
    lineHeight: 29,
    fontWeight: "700",
  },
  body: { color: "#52675b", fontSize: 16, lineHeight: 25, marginTop: 8 },
  step: { color: "#354f40", fontSize: 17, lineHeight: 28, marginTop: 16 },
  label: {
    color: "#344e40",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 22,
    marginBottom: 10,
  },
  input: {
    minHeight: 56,
    color: "#213c2f",
    fontSize: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bbcbbf",
    borderRadius: 12,
    backgroundColor: "#fbfcfa",
  },
  button: {
    minHeight: 62,
    borderRadius: 16,
    backgroundColor: "#17694f",
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  buttonText: {
    color: "#fff",
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "700",
    textAlign: "center",
  },
  disabled: { opacity: 0.5 },
  secondaryButton: {
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: "#edf3ec",
  },
  secondaryText: {
    color: "#1b654a",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  workCard: {
    backgroundColor: "#fff",
    borderColor: "#dae5d8",
    borderWidth: 1,
    padding: 24,
    borderRadius: 24,
  },
  workingCard: { backgroundColor: "#eaf4ec", borderColor: "#cce2d0" },
  statusCircle: {
    backgroundColor: "#e5eee2",
    borderRadius: 30,
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  statusSymbol: { color: "#17694f", fontSize: 34, fontWeight: "600" },
  workTitle: {
    color: "#213c2f",
    fontSize: 27,
    fontWeight: "700",
    lineHeight: 35,
  },
  workDescription: {
    color: "#52675b",
    fontSize: 17,
    lineHeight: 27,
    marginTop: 12,
  },
  smallNote: {
    color: "#586e5f",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 14,
  },
  taskSummary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 22,
    marginTop: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e1e8df",
    gap: 16,
  },
  flex: { flex: 1 },
  arrow: { fontSize: 29, color: "#17694f" },
  notice: { color: "#647365", fontSize: 14, lineHeight: 22, marginTop: 18 },
  taskStatus: {
    color: "#2e7653",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
  },
  due: { fontSize: 14, color: "#647365", marginTop: 12, lineHeight: 22 },
  error: {
    backgroundColor: "#fff4e4",
    borderRadius: 18,
    padding: 20,
    marginTop: 18,
  },
  errorTitle: {
    color: "#7d4b0d",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  errorText: { color: "#775321", fontSize: 15, lineHeight: 24 },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 12,
    paddingBottom: Platform.OS === "android" ? 28 : 12,
    borderTopWidth: 1,
    borderTopColor: "#e1e8df",
    gap: 6,
  },
  tab: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  selectedTab: { backgroundColor: "#e6f0e5" },
  tabText: {
    color: "#617165",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  selectedTabText: { color: "#155d42", fontWeight: "800" },
});
