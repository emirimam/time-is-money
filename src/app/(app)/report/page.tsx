"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { MonthPicker } from "@/components/MonthPicker";
import { useEntriesRealtime } from "@/components/useEntriesRealtime";
import { buildReport, type Totals } from "@/lib/report";
import { downloadBlob, reportToCsv, reportToXlsx } from "@/lib/export";
import {
  currentMonth,
  formatHours,
  formatMinutes,
  formatMoney,
  hhmm,
  isoDate,
  monthIso,
  monthLabel,
  monthRange,
  type MonthKey,
} from "@/lib/time";
import type { Profile, TimeEntry } from "@/lib/types";

export default function ReportPage() {
  const { supabase, isAdmin, tz, settings, buildings, scopes, profile } = useApp();
  const [month, setMonth] = useState<MonthKey>(() => currentMonth(tz));
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRows, setShowRows] = useState(false);

  const load = useCallback(async () => {
    const [from, to] = monthRange(month, tz);
    const [entriesRes, peopleRes, lockRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .lt("started_at", to.toISOString())
        .or(`ended_at.gt.${from.toISOString()},ended_at.is.null`)
        .order("started_at"),
      supabase.from("profiles").select("*"),
      supabase.from("month_locks").select("month").eq("month", monthIso(month)).maybeSingle(),
    ]);
    setEntries((entriesRes.data as TimeEntry[]) ?? []);
    setPeople((peopleRes.data as Profile[]) ?? []);
    setLocked(!!lockRes.data);
    setLoading(false);
  }, [supabase, month, tz]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    load();
  }, [load]);

  useEntriesRealtime(null, load);

  const report = useMemo(() => {
    const [from, to] = monthRange(month, tz);
    return buildReport(
      entries,
      from,
      to,
      settings,
      new Map(people.map((p) => [p.id, p])),
      new Map(buildings.map((b) => [b.id, b])),
      new Map(scopes.map((s) => [s.id, s])),
    );
  }, [entries, people, buildings, scopes, settings, month, tz]);

  if (!isAdmin) return <p className="text-muted">Only the admin can see reports.</p>;

  const fileBase = `${monthLabel(month).replace(" ", "_")}_${settings.client_name.replace(/\s+/g, "_")}_Time_Sheet`;

  async function exportXlsx() {
    setBusy(true);
    try {
      const blob = await reportToXlsx(report, tz, monthLabel(month), settings.currency);
      downloadBlob(blob, `${fileBase}.xlsx`);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  function exportCsv() {
    downloadBlob(new Blob([reportToCsv(report, tz)], { type: "text/csv;charset=utf-8" }), `${fileBase}.csv`);
  }

  async function toggleLock() {
    setBusy(true);
    setError(null);
    const { error } = locked
      ? await supabase.from("month_locks").delete().eq("month", monthIso(month))
      : await supabase.from("month_locks").insert({ month: monthIso(month), locked_by: profile.id });
    setBusy(false);
    if (error) setError(error.message);
    else setLocked(!locked);
  }

  const money = (n: number) => formatMoney(n, settings.currency);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} locked={locked} />
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportXlsx} disabled={busy || !report.rows.length}>
            Excel
          </button>
          <button className="btn-secondary" onClick={exportCsv} disabled={!report.rows.length}>
            CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="label">Hours</p>
          <p className="tabular text-3xl font-semibold">{formatHours(report.total.minutes)}</p>
          <p className="tabular text-xs text-muted">{formatMinutes(report.total.minutes)} h:min</p>
        </div>
        <div className="card p-4">
          <p className="label">To bill</p>
          <p className="tabular text-3xl font-semibold text-accent">{money(report.total.cost)}</p>
          <p className="text-xs text-muted">{settings.client_name}</p>
        </div>
      </div>

      {report.running.length > 0 && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {report.running.length} timer{report.running.length > 1 ? "s are" : " is"} still running and not included yet.
        </p>
      )}
      {settings.rounding_minutes > 1 && (
        <p className="px-1 text-xs text-muted">
          Each entry is rounded {settings.rounding_mode === "nearest" ? "to the nearest" : settings.rounding_mode}{" "}
          {settings.rounding_minutes} min before totals.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <Breakdown
            title="By person"
            rows={report.byPerson.map((p) => ({ ...p, extra: `${money(p.rate)}/h` }))}
            money={money}
          />
          <Breakdown title="By building" rows={report.byBuilding} money={money} />
          <Breakdown title="By scope" rows={report.byScope} money={money} />

          <section>
            <button className="mb-2 px-1 text-sm font-semibold" onClick={() => setShowRows(!showRows)}>
              {showRows ? "▾" : "▸"} All entries ({report.rows.length})
            </button>
            {showRows && (
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2">Date</th>
                      {report.byPerson.length > 1 && <th className="px-3 py-2">Person</th>}
                      <th className="px-3 py-2">Work</th>
                      <th className="px-3 py-2">Building</th>
                      <th className="px-3 py-2">Scope</th>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2 text-right">Hours</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {report.rows.map((r) => (
                      <tr key={r.id + r.start.toISOString()} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-3 py-2">{isoDate(r.start, tz)}</td>
                        {report.byPerson.length > 1 && <td className="px-3 py-2">{r.person}</td>}
                        <td className="px-3 py-2">{r.work}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.building}</td>
                        <td className="px-3 py-2">{r.scope}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {hhmm(r.start, tz)}–{hhmm(r.end, tz)}
                        </td>
                        <td className="px-3 py-2 text-right">{formatHours(r.minutes)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{money(r.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-medium">{locked ? "Month is locked" : "Lock this month"}</p>
          <p className="text-sm text-muted">
            {locked
              ? "Nobody can add or change entries in this month."
              : "After you bill, lock the month so the numbers can't change."}
          </p>
        </div>
        <button className={locked ? "btn-secondary" : "btn-primary"} onClick={toggleLock} disabled={busy}>
          {locked ? "Unlock" : "Lock month"}
        </button>
      </section>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  money,
}: {
  title: string;
  rows: { key: string; label: string; totals: Totals; extra?: string }[];
  money: (n: number) => string;
}) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.totals.minutes), 1);
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-semibold">{title}</h2>
      <ul className="card divide-y divide-border">
        {rows.map((r) => (
          <li key={r.key} className="px-4 py-3">
            <div className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate text-sm">
                {r.label}
                {r.extra && <span className="ml-2 text-xs text-muted">{r.extra}</span>}
              </span>
              <span className="tabular text-sm text-muted">{formatHours(r.totals.minutes)} h</span>
              <span className="tabular w-24 text-right text-sm font-medium">{money(r.totals.cost)}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-background">
              <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(r.totals.minutes / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
