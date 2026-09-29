import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "../app/dashboard";
import "../app/globals.css";
function App() {
  const [ready, setReady] = useState(false),
    [signedIn, setSignedIn] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/session")
      .then((r) => setSignedIn(r.ok))
      .finally(() => setReady(true));
  }, []);
  if (!ready) return <div className="login-shell">Opening workspace…</div>;
  if (signedIn)
    return (
      <Dashboard
        onSignOut={async () => {
          await fetch("/api/logout", { method: "POST" });
          setSignedIn(false);
        }}
      />
    );
  return (
    <div className="login-shell">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const password = new FormData(e.currentTarget).get("password");
          try {
            const r = await fetch("/api/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password }),
            });
            if (!r.ok)
              throw new Error(((await r.json()) as { error: string }).error);
            setSignedIn(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="eyebrow">GROSUITE / FIELD</span>
        <h1>Sign in to GroSuite</h1>
        <p>Sign in to your team workspace.</p>
        <label htmlFor="password">Workspace password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <button className="button primary" disabled={busy}>
          {busy ? "Signing in…" : "Open workspace"}
        </button>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <small>
          Employee and admin phones connect with their own access keys.
        </small>
      </form>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
