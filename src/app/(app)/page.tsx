"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { LookupSelect } from "@/components/LookupSelect";
import { EntryEditor } from "@/components/EntryEditor";
import { useEntriesRealtime } from "@/components/useEntriesRealtime";
import { dayRange, entryMinutes, formatElapsed, formatMinutes, hhmm } from "@/lib/time";
import type { TimeEntry } from "@/lib/types";

const LAST_KEY = "tim:last-selection";

export default function TimerPage() {
  const { supabase, profile, tz, buildings, scopes, settings } = useApp();
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [today, setToday] = useState<TimeEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState<TimeEntry | null>(null);

  // Selection for the next start (remembered on this device).
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [work, setWork] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}");
      /* eslint-disable react-hooks/set-state-in-effect */
      if (saved.buildingId && buildings.some((b) => b.id === saved.buildingId)) setBuildingId(saved.buildingId);
      if (saved.scopeId && scopes.some((s) => s.id === saved.scopeId)) setScopeId(saved.scopeId);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // ignore
    }
  }, [buildings, scopes]);

  const load = useCallback(async () => {
    const [from, to] = dayRange(new Date(), tz);
    const [runningRes, todayRes] = await Promise.all([
      supabase.from("time_entries").select("*").eq("user_id", profile.id).is("ended_at", null).maybeSingle(),
      supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", profile.id)
        .lt("started_at", to.toISOString())
        .or(`ended_at.gt.${from.toISOString()},ended_at.is.null`)
        .order("started_at", { ascending: false }),
    ]);
    const r = (runningRes.data as TimeEntry | null) ?? null;
    setRunning(r);
    if (r) {
      setBuildingId(r.building_id);
      setScopeId(r.scope_id);
      setWork(r.work);
    }
    setToday((todayRes.data as TimeEntry[]) ?? []);
    setLoaded(true);
  }, [supabase, profile.id, tz]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEntriesRealtime(profile.id, load);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [running]);

  function remember(b: string | null, s: string | null) {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ buildingId: b, scopeId: s }));
    } catch {
      // ignore
    }
  }

  async function start() {
    setBusy(true);
    setError(null);
    remember(buildingId, scopeId);
    const { data, error } = await supabase.rpc("start_timer", {
      p_building_id: buildingId,
      p_scope_id: scopeId,
      p_work: work.trim(),
    });
    setBusy(false);
    if (error) return setError(error.message);
    setRunning(data as TimeEntry);
    setNow(new Date());
    load();
  }

  async function stop() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("stop_timer");
    setBusy(false);
    if (error) return setError(error.message);
    setRunning(null);
    setWork("");
    load();
  }

  // While running, edits to building/scope/work are saved to the running entry.
  async function updateRunning(patch: Partial<Pick<TimeEntry, "building_id" | "scope_id" | "work">>) {
    if (!running) return;
    const { error } = await supabase.from("time_entries").update(patch).eq("id", running.id);
    if (error) setError(error.message);
  }

  const elapsedSec = running ? (now.getTime() - new Date(running.started_at).getTime()) / 1000 : 0;
  const longRunning = running && elapsedSec > settings.long_timer_hours * 3600;
  const [dayFrom, dayTo] = dayRange(now, tz);
  const todayMinutes = today.reduce((s, e) => s + entryMinutes(e.started_at, e.ended_at, dayFrom, dayTo, now), 0);

  return (
    <div className="space-y-6">
      <section className="card p-5 sm:p-6">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            {running ? `Running since ${hhmm(new Date(running.started_at), tz)}` : "Not running"}
          </p>
          <p className={`tabular mt-2 font-mono text-6xl font-semibold tracking-tight sm:text-7xl ${running ? "" : "text-muted/60"}`}>
            {formatElapsed(elapsedSec)}
          </p>
        </div>

        {longRunning && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            This timer has been running for over {settings.long_timer_hours} hours. Forgot to stop it?{" "}
            <button className="font-medium underline" onClick={() => setEditing(running)}>
              Set the real stop time
            </button>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="t-building">Building</label>
            <LookupSelect
              id="t-building"
              items={buildings}
              value={buildingId}
              placeholder="—"
              onChange={(v) => {
                setBuildingId(v);
                remember(v, scopeId);
                updateRunning({ building_id: v });
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="t-scope">Scope</label>
            <LookupSelect
              id="t-scope"
              items={scopes}
              value={scopeId}
              placeholder="—"
              onChange={(v) => {
                setScopeId(v);
                remember(buildingId, v);
                updateRunning({ scope_id: v });
              }}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="label" htmlFor="t-work">Work</label>
          <input
            id="t-work"
            className="input"
            placeholder="Going thru emails…"
            value={work}
            onChange={(e) => setWork(e.target.value)}
            onBlur={() => running && work.trim() !== running.work && updateRunning({ work: work.trim() })}
          />
        </div>

        <button
          onClick={running ? stop : start}
          disabled={busy || !loaded}
          className={`btn mt-5 h-16 w-full text-lg font-semibold ${
            running ? "bg-danger text-white hover:brightness-110" : "bg-accent text-white hover:brightness-110 dark:text-black"
          }`}
        >
          {!loaded ? "Loading…" : running ? "Stop" : "Start"}
        </button>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="font-semibold">Today</h2>
          <span className="tabular text-sm text-muted">{formatMinutes(todayMinutes)} h</span>
        </div>
        {today.length === 0 ? (
          <p className="card p-4 text-sm text-muted">Nothing tracked yet today.</p>
        ) : (
          <ul className="card divide-y divide-border">
            {today.map((e) => {
              const b = buildings.find((x) => x.id === e.building_id)?.name;
              const s = scopes.find((x) => x.id === e.scope_id)?.name;
              return (
                <li key={e.id}>
                  <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setEditing(e)}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.work || <span className="text-muted">No description</span>}</p>
                      <p className="truncate text-xs text-muted">{[b, s].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-sm">
                        {hhmm(new Date(e.started_at), tz)}–{e.ended_at ? hhmm(new Date(e.ended_at), tz) : "now"}
                      </p>
                      <p className="tabular text-xs text-muted">
                        {formatMinutes(entryMinutes(e.started_at, e.ended_at, undefined, undefined, now))}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && (
        <EntryEditor entry={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  );
}
