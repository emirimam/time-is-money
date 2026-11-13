"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { MonthPicker } from "@/components/MonthPicker";
import { EntryEditor } from "@/components/EntryEditor";
import { useEntriesRealtime } from "@/components/useEntriesRealtime";
import {
  currentMonth,
  dayHeading,
  entryMinutes,
  formatMinutes,
  hhmm,
  isoDate,
  monthIso,
  monthRange,
  roundMinutes,
  type MonthKey,
} from "@/lib/time";
import type { Profile, TimeEntry } from "@/lib/types";

export default function EntriesPage() {
  const { supabase, profile, isAdmin, tz, buildings, scopes, settings } = useApp();
  const [month, setMonth] = useState<MonthKey>(() => currentMonth(tz));
  const [person, setPerson] = useState<string>(profile.id); // "all" for admin
  const [people, setPeople] = useState<Profile[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TimeEntry | "new" | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("profiles")
      .select("*")
      .order("full_name")
      .then(({ data }) => setPeople((data as Profile[]) ?? []));
  }, [supabase, isAdmin]);

  const load = useCallback(async () => {
    const [from, to] = monthRange(month, tz);
    let q = supabase
      .from("time_entries")
      .select("*")
      .lt("started_at", to.toISOString())
      .or(`ended_at.gt.${from.toISOString()},ended_at.is.null`)
      .order("started_at", { ascending: false });
    if (person !== "all") q = q.eq("user_id", person);
    const [entriesRes, lockRes] = await Promise.all([
      q,
      supabase.from("month_locks").select("month").eq("month", monthIso(month)).maybeSingle(),
    ]);
    setEntries((entriesRes.data as TimeEntry[]) ?? []);
    setLocked(!!lockRes.data);
    setLoading(false);
  }, [supabase, month, person, tz]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    load();
  }, [load]);

  useEntriesRealtime(person === "all" ? null : person, load);

  const [from, to] = useMemo(() => monthRange(month, tz), [month, tz]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const rounded = useCallback(
    (e: TimeEntry, f?: Date, t?: Date) =>
      e.ended_at
        ? roundMinutes(entryMinutes(e.started_at, e.ended_at, f, t), settings.rounding_minutes, settings.rounding_mode)
        : entryMinutes(e.started_at, null, f, t),
    [settings],
  );

  const groups = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const e of entries) {
      const key = isoDate(new Date(e.started_at), tz);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries, tz]);

  const monthTotal = entries.reduce((s, e) => s + rounded(e, from, to), 0);
  const showPerson = isAdmin && person === "all";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} locked={locked} />
        <button className="btn-primary" onClick={() => setEditing("new")} disabled={locked}>
          + Add entry
        </button>
      </div>

      {isAdmin && people.length > 1 && (
        <select className="input" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="all">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email}
            </option>
          ))}
        </select>
      )}

      <div className="card flex items-center justify-between px-4 py-3">
        <span className="text-sm text-muted">
          Month total{settings.rounding_minutes > 1 ? ` (rounded to ${settings.rounding_minutes} min)` : ""}
        </span>
        <span className="tabular text-lg font-semibold">{formatMinutes(monthTotal)} h</span>
      </div>

      {locked && (
        <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent">
          This month is locked after billing. Entries can&apos;t be changed{isAdmin ? " until you unlock it in Report" : ""}.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="card p-4 text-sm text-muted">No entries this month.</p>
      ) : (
        groups.map(([day, list]) => {
          const dayDate = new Date(list[0].started_at);
          const dayTotal = list.reduce((s, e) => s + rounded(e, from, to), 0);
          return (
            <section key={day}>
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold">{dayHeading(dayDate, tz)}</h2>
                <span className="tabular text-sm text-muted">{formatMinutes(dayTotal)} h</span>
              </div>
              <ul className="card divide-y divide-border">
                {list.map((e) => {
                  const b = buildings.find((x) => x.id === e.building_id)?.name;
                  const s = scopes.find((x) => x.id === e.scope_id)?.name;
                  const who = showPerson ? peopleById.get(e.user_id) : null;
                  return (
                    <li key={e.id}>
                      <button
                        className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
                        onClick={() => setEditing(e)}
                        disabled={locked}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {e.work || <span className="text-muted">No description</span>}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {[who?.full_name || who?.email, b, s].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="tabular text-sm">
                            {hhmm(new Date(e.started_at), tz)}–{e.ended_at ? hhmm(new Date(e.ended_at), tz) : "now"}
                          </p>
                          <p className="tabular text-xs text-muted">
                            {e.ended_at ? formatMinutes(rounded(e)) : "running"}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      {editing && (
        <EntryEditor
          entry={editing === "new" ? null : editing}
          people={people}
          defaultUserId={person !== "all" ? person : profile.id}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
