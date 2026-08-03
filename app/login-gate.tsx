"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";

export default function LoginGate() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode: form.get("passcode") }),
    });
    if (response.ok) window.location.reload();
    else {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "That passcode is not correct.");
      setLoading(false);
    }
  }

  return <main className="login-shell">
    <div className="login-glow" />
    <section className="login-card" aria-labelledby="jarvis-login-title">
      <div className="login-mark"><ShieldCheck /></div>
      <small>SECURE PORTFOLIO INTELLIGENCE</small>
      <h1 id="jarvis-login-title">JARVIS</h1>
      <p>Enter your private access code to open the operations cockpit.</p>
      <form onSubmit={unlock}>
        <label htmlFor="passcode">Passcode</label>
        <div className="passcode-field"><LockKeyhole /><input id="passcode" name="passcode" type="password" autoComplete="current-password" autoCapitalize="characters" autoFocus required /></div>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="primary full" disabled={loading}>{loading ? "Verifying..." : "Unlock JARVIS"}</button>
      </form>
      <footer><i /> Encrypted session · expires after 7 days</footer>
    </section>
  </main>;
}

