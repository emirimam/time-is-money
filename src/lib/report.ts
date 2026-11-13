import type { Lookup, Profile, Settings, TimeEntry } from "./types";
import { entryMinutes, roundMinutes } from "./time";

export interface ReportRow {
  id: string;
  userId: string;
  person: string;
  work: string;
  building: string;
  scope: string;
  start: Date; // clipped to the month
  end: Date;
  rawMinutes: number;
  minutes: number; // after rounding
  rate: number;
  cost: number;
}

export interface Totals {
  minutes: number;
  cost: number;
}

export interface Report {
  rows: ReportRow[];
  running: TimeEntry[];
  total: Totals;
  byPerson: { key: string; label: string; rate: number; totals: Totals }[];
  byBuilding: { key: string; label: string; totals: Totals }[];
  byScope: { key: string; label: string; totals: Totals }[];
}

export function buildReport(
  entries: TimeEntry[],
  from: Date,
  to: Date,
  settings: Settings,
  profiles: Map<string, Profile>,
  buildings: Map<string, Lookup>,
  scopes: Map<string, Lookup>,
): Report {
  const rows: ReportRow[] = [];
  const running: TimeEntry[] = [];

  for (const e of entries) {
    if (!e.ended_at) {
      running.push(e);
      continue;
    }
    const start = new Date(Math.max(new Date(e.started_at).getTime(), from.getTime()));
    const end = new Date(Math.min(new Date(e.ended_at).getTime(), to.getTime()));
    if (end <= start) continue;
    const rawMinutes = entryMinutes(e.started_at, e.ended_at, from, to);
    const minutes = roundMinutes(rawMinutes, settings.rounding_minutes, settings.rounding_mode);
    const profile = profiles.get(e.user_id);
    const rate = Number(e.rate_snapshot ?? profile?.hourly_rate ?? settings.default_rate);
    rows.push({
      id: e.id,
      userId: e.user_id,
      person: profile?.full_name || profile?.email || "Unknown",
      work: e.work,
      building: (e.building_id && buildings.get(e.building_id)?.name) || "",
      scope: (e.scope_id && scopes.get(e.scope_id)?.name) || "",
      start,
      end,
      rawMinutes,
      minutes,
      rate,
      cost: round2((minutes / 60) * rate),
    });
  }

  rows.sort((a, b) => a.start.getTime() - b.start.getTime());

  const sum = (list: ReportRow[]): Totals => ({
    minutes: list.reduce((s, r) => s + r.minutes, 0),
    cost: round2(list.reduce((s, r) => s + r.cost, 0)),
  });

  const group = (keyOf: (r: ReportRow) => string) => {
    const map = new Map<string, ReportRow[]>();
    for (const r of rows) {
      const k = keyOf(r);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()]
      .map(([key, list]) => ({ key, label: key || "—", totals: sum(list), list }))
      .sort((a, b) => b.totals.minutes - a.totals.minutes);
  };

  return {
    rows,
    running,
    total: sum(rows),
    byPerson: group((r) => r.userId).map((g) => ({
      key: g.key,
      label: g.list[0].person,
      rate: g.list[0].rate,
      totals: g.totals,
    })),
    byBuilding: group((r) => r.building).map(({ key, label, totals }) => ({ key, label, totals })),
    byScope: group((r) => r.scope).map(({ key, label, totals }) => ({ key, label, totals })),
  };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
