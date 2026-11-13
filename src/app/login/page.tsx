"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const supabase = createClient();

  const done = (to = "/") => {
    router.replace(to);
    router.refresh();
  };

  // Fallback for email links that return tokens in the URL hash (default Supabase templates).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    if (hash.get("error_description")) setError(hash.get("error_description"));
    if (new URLSearchParams(window.location.search).get("error") === "link") {
      setError("That sign-in link is invalid or has expired. Request a new one.");
    }
    if (!access_token || !refresh_token) return;
    const type = hash.get("type");
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) setError(error.message);
        else done(type === "invite" || type === "recovery" ? "/settings?welcome=1" : "/");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else done();
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (error) setError(error.message);
    else {
      setCodeSent(true);
      setInfo("Check your email. Tap the link, or type the 6-digit code here.");
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(error.message);
    else done();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-lg font-semibold text-white dark:text-black">
          $
        </span>
        <div>
          <h1 className="text-xl font-semibold">Time is Money</h1>
          <p className="text-sm text-muted">Sign in to track your hours</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-lg border border-border bg-surface p-1 text-sm">
        {(["password", "code"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setInfo(null);
            }}
            className={`rounded-md py-2 ${mode === m ? "bg-accent-soft font-medium text-accent" : "text-muted"}`}
          >
            {m === "password" ? "Password" : "Email code"}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <form onSubmit={signInWithPassword} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" className="input"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" required autoComplete="current-password" className="input"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : !codeSent ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <label className="label" htmlFor="email2">Email</label>
            <input id="email2" type="email" required autoComplete="email" className="input"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Sending…" : "Email me a sign-in code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          <div>
            <label className="label" htmlFor="code">Code</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" required
              className="input tabular text-center text-2xl tracking-[0.4em]"
              value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button type="button" className="w-full text-sm text-muted" onClick={() => setCodeSent(false)}>
            Use a different email
          </button>
        </form>
      )}

      {info && <p className="mt-4 text-sm text-muted">{info}</p>}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <p className="mt-10 text-xs text-muted">
        No account? Ask the admin to invite you.
      </p>
    </main>
  );
}
