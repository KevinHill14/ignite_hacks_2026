"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        // Full navigation, not a router push — the cookie has to be attached
        // to a fresh request before the proxy will let anything through.
        window.location.href = "/";
        return;
      }
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "That did not work.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell gate">
      <p className="masthead__form-no">Form SYL-1 · Term cost &amp; schedule</p>
      <hr className="rule-heavy" />

      <h1 className="gate__title">
        This one&apos;s <em>locked</em>.
      </h1>
      <p className="gate__lede">
        It runs a real syllabus through a real model and writes to a real
        calendar, so it is not left open to the internet. If you were given a
        password, it goes here.
      </p>

      <form className="gate__form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">Password</span>
          <input
            className="field__input"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn" type="submit" disabled={busy || !password}>
          {busy ? "Checking…" : "Let me in"}
        </button>
      </form>

      {error && (
        <div className="notice" style={{ marginTop: 22, maxWidth: "48ch" }}>
          <span className="notice__label">Not in</span>
          {error}
        </div>
      )}
    </main>
  );
}
