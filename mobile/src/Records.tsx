import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
export type RecordsData = {
  sites: { id: string; name: string; radius: number }[];
  history: {
    id: string;
    started: number;
    ended: number | null;
    siteName: string | null;
  }[];
  leaves: {
    id: string;
    startDate: string;
    endDate: string;
    kind: string;
    status: string;
    reason: string;
    reviewNote: string;
  }[];
};
export const emptyRecords: RecordsData = { sites: [], history: [], leaves: [] };
export function Records({
  data,
  busy,
  onLeave,
}: {
  data: RecordsData;
  busy: boolean;
  onLeave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [tab, setTab] = useState("Attendance"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [kind, setKind] = useState("Annual"),
    [reason, setReason] = useState(""),
    [form, setForm] = useState(false);
  return (
    <>
      <Text style={s.heading}>My records</Text>
      <View style={s.row}>
        {["Attendance", "Time off"].map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: t === tab }}
            style={[s.chip, t === tab && s.selected]}
            onPress={() => setTab(t)}
          >
            <Text style={t === tab ? s.selectedText : s.text}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {tab === "Attendance" ? (
        <>
          <View style={s.card}>
            <Text style={s.title}>Clock-in locations</Text>
            <Text style={s.text}>
              {data.sites.length
                ? "Start work inside one of your assigned sites. Your phone checks a fresh GPS fix before clock-in."
                : "Field attendance · no site restriction is currently assigned."}
            </Text>
            {data.sites.map((site) => (
              <Text key={site.id} style={s.site}>
                {site.name} · {site.radius} m radius
              </Text>
            ))}
          </View>
          {data.history.map((h) => (
            <View key={h.id} style={s.card}>
              <View style={s.spread}>
                <Text style={s.title}>
                  {new Date(h.started).toLocaleDateString()}
                </Text>
                <Text style={s.site}>
                  {h.ended
                    ? Math.round((h.ended - h.started) / 60000) + " min"
                    : "Active"}
                </Text>
              </View>
              <Text style={s.text}>
                {new Date(h.started).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                →{" "}
                {h.ended
                  ? new Date(h.ended).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Working"}
              </Text>
              <Text style={s.note}>
                {h.siteName ? "Verified at " + h.siteName : "Field shift"}
              </Text>
            </View>
          ))}
          {!data.history.length && (
            <Text style={s.text}>
              Your shifts will appear after your first clock-in.
            </Text>
          )}
        </>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            style={s.button}
            onPress={() => setForm(!form)}
          >
            <Text style={s.selectedText}>
              {form ? "Close request" : "Request time off"}
            </Text>
          </Pressable>
          {form && (
            <View style={s.card}>
              <Text style={s.title}>New leave request</Text>
              <Text style={s.note}>Dates use YYYY-MM-DD</Text>
              <Text style={s.label}>First day</Text>
              <TextInput
                accessibilityLabel="First day"
                placeholder="2026-09-25"
                value={start}
                onChangeText={setStart}
                style={s.input}
              />
              <Text style={s.label}>Last day</Text>
              <TextInput
                accessibilityLabel="Last day"
                placeholder="2026-09-25"
                value={end}
                onChangeText={setEnd}
                style={s.input}
              />
              <View style={s.row}>
                {["Annual", "Sick", "Personal"].map((k) => (
                  <Pressable
                    key={k}
                    style={[s.chip, kind === k && s.selected]}
                    onPress={() => setKind(k)}
                  >
                    <Text style={kind === k ? s.selectedText : s.text}>
                      {k}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.label}>Reason</Text>
              <TextInput
                accessibilityLabel="Reason"
                multiline
                maxLength={500}
                value={reason}
                onChangeText={setReason}
                style={s.input}
              />
              <Pressable
                disabled={busy || !start || !end || !reason.trim()}
                style={[
                  s.button,
                  (busy || !start || !end || !reason.trim()) && {
                    opacity: 0.5,
                  },
                ]}
                onPress={async () => {
                  if (
                    await onLeave({
                      action: "leave",
                      startDate: start,
                      endDate: end,
                      kind,
                      reason,
                    })
                  ) {
                    setForm(false);
                    setReason("");
                    setStart("");
                    setEnd("");
                  }
                }}
              >
                <Text style={s.selectedText}>
                  {busy ? "Sending…" : "Send request"}
                </Text>
              </Pressable>
            </View>
          )}
          {data.leaves.map((l) => (
            <View key={l.id} style={s.card}>
              <View style={s.spread}>
                <Text style={s.title}>{l.kind} leave</Text>
                <Text style={s.site}>{l.status}</Text>
              </View>
              <Text style={s.text}>
                {l.startDate} → {l.endDate}
              </Text>
              <Text style={s.note}>{l.reason}</Text>
              {!!l.reviewNote && (
                <Text style={s.text}>Manager: {l.reviewNote}</Text>
              )}
            </View>
          ))}
          {!data.leaves.length && !form && (
            <Text style={s.text}>
              Your requests and manager decisions appear here.
            </Text>
          )}
        </>
      )}
    </>
  );
}
const s = StyleSheet.create({
  heading: {
    fontSize: 30,
    fontWeight: "700",
    color: "#17372c",
    marginBottom: 24,
  },
  row: { flexDirection: "row", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  spread: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  chip: { padding: 12, borderRadius: 6, backgroundColor: "#e6ece8" },
  selected: { backgroundColor: "#17694f" },
  selectedText: { color: "white", fontWeight: "600", fontSize: 15 },
  text: { fontSize: 16, color: "#445a50", lineHeight: 24 },
  note: { fontSize: 14, color: "#62776b", lineHeight: 22 },
  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dbe4de",
    borderRadius: 12,
    padding: 20,
    gap: 12,
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "600", color: "#19392d" },
  site: { fontSize: 14, fontWeight: "600", color: "#17694f" },
  button: {
    backgroundColor: "#17694f",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#c7d3cb",
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    color: "#17372c",
  },
  label: { fontSize: 14, fontWeight: "600", color: "#445a50" },
});
