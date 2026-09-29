import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import { emptyRecords, type RecordsData } from "./src/Records";
import { EmployeeScreens } from "./src/EmployeeScreens";
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
type CachedEmployee = { employeeId: string; name: string; tasks: Task[] };
export default function App() {
  const [records, setRecords] = useState<RecordsData>(emptyRecords);
  const [needsRecovery, setNeedsRecovery] = useState(false);
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
  const refreshing = useRef<Promise<void> | null>(null);
  const refreshLocal = useCallback(async () => {
    const [current, queued, synced, syncError, syncNotice] = await Promise.all([
      active(),
      queueCount(),
      getValue<number>("lastSync"),
      getValue<string>("syncError"),
      getValue<string>("syncNotice"),
    ]);
    setSession(current);
    setPending(queued);
    setLastSync(synced);
    setError(syncError ?? syncNotice ?? "");
  }, []);
  const refresh = useCallback(() => {
    if (refreshing.current) return refreshing.current;
    const work = (async () => {
      try {
        await refreshLocal();
        const savedCredentials = await credentials();
        if (savedCredentials) {
          setPaired(true);
          const data = await api(undefined, savedCredentials);
          if ((await credentials())?.token !== savedCredentials.token) return;
          setName(data.employee.name);
          setTasks(data.tasks);
          setRecords({
            sites: data.sites ?? [],
            history: data.history ?? [],
            leaves: data.leaves ?? [],
          });
          await setValue("employeeCache", {
            employeeId: data.employee.id,
            name: data.employee.name,
            tasks: data.tasks,
          });
          const current = await active();
          const tracking = current
            ? await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)
            : false;
          setNeedsRecovery(
            !!(current && !tracking) || !!(data.shift && !current),
          );
          if (current && !tracking)
            setError(
              "Location sharing stopped unexpectedly. Tap Continue my workday to start sharing again.",
            );
          if (data.shift && !current)
            setError(
              "Your workday is still marked as active. You can continue it or finish it here.",
            );
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    refreshing.current = work;
    void work.finally(() => {
      refreshing.current = null;
    });
    return work;
  }, [refreshLocal]);
  useEffect(() => {
    let mounted = true;
    // Render persisted state before attempting any network request.
    void (async () => {
      try {
        const [savedCredentials, employeeId, cached] = await Promise.all([
          credentials(),
          getValue<string>("employeeId"),
          getValue<CachedEmployee>("employeeCache"),
        ]);
        if (!mounted) return;
        setPaired(!!savedCredentials);
        if (savedCredentials && cached?.employeeId === employeeId) {
          setName(cached.name);
          setTasks(cached.tasks);
        }
        await refreshLocal();
      } catch (e) {
        if (mounted) setError((e as Error).message);
      } finally {
        if (mounted) {
          setReady(true);
          void refresh();
        }
      }
    })();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 15000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
        void sync()
          .catch(() => {})
          .finally(refresh);
      }
    });
    return () => {
      mounted = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [refresh, refreshLocal]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    let actionError = "";
    try {
      await fn();
      setError("");
    } catch (e) {
      actionError = (e as Error).message;
      setError(actionError);
      Alert.alert("Please try again", actionError);
    } finally {
      setBusy(false);
      try {
        await refreshLocal();
      } catch (e) {
        setError((e as Error).message);
      }
      if (actionError) setError(actionError);
      else void refresh();
    }
  }
  async function pair() {
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      throw new Error(
        "Ask your manager for the full company address and paste it here.",
      );
    }
    if (
      parsed.protocol !== "https:" &&
      !(__DEV__ && parsed.protocol === "http:")
    )
      throw new Error(
        "The company address must begin with https://. Ask your manager for the correct address.",
      );
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    )
      throw new Error(
        "This company address doesn’t look right. Ask your manager for the app’s connection address.",
      );
    if (!/^fp_[a-f0-9]{64}$/.test(key.trim()))
      throw new Error("Paste the complete setup code from your manager.");
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
      await setValue("employeeCache", {
        employeeId: data.employee.id,
        name: data.employee.name,
        tasks: data.tasks,
      });
      setName(data.employee.name);
      setTasks(data.tasks);
      setPaired(true);
      setRepairMode(false);
      setKey("");
    } catch (e) {
      throw e;
    }
  }
  return (
    <EmployeeScreens
      records={records}
      onLeave={async (body) => {
        setBusy(true);
        try {
          await api(body);
          await refresh();
          return true;
        } catch (e) {
          Alert.alert("Could not send request", (e as Error).message);
          return false;
        } finally {
          setBusy(false);
        }
      }}
      ready={ready}
      paired={paired}
      repairMode={repairMode}
      busy={busy}
      name={name}
      session={session}
      tasks={tasks}
      pending={pending}
      lastSync={lastSync}
      error={error}
      needsRecovery={needsRecovery}
      url={url}
      deviceKey={key}
      setUrl={setUrl}
      setKey={setKey}
      setRepairMode={setRepairMode}
      pair={() => {
        void act(pair);
      }}
      start={() => {
        void act(startShift);
      }}
      finish={() => {
        void act(endShift);
      }}
      sync={() => {
        void act(sync);
      }}
      updateTask={(task) => {
        void act(() =>
          api({
            action: "task-status",
            id: task.id,
            status: task.status === "Assigned" ? "In progress" : "Completed",
          }),
        );
      }}
      recoverFinish={() => {
        void act(async () => {
          const data = await api();
          if (data.shift)
            await api({
              action: "stop",
              shiftId: data.shift.id,
              ended: Math.max(data.shift.started, Date.now()),
            });
          await endShift();
        });
      }}
    />
  );
}
