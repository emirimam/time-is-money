import type { RoundingMode } from "./types";

// ---------------------------------------------------------------------------
// Time-zone helpers (no external dependency; uses Intl)
// ---------------------------------------------------------------------------

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string) {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, tz: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

function offsetMs(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Wall-clock time in `tz` -> real instant. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  tz: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess - offsetMs(new Date(guess), tz);
  // Second pass handles DST transitions.
  result = guess - offsetMs(new Date(result), tz);
  return new Date(result);
}

export interface MonthKey {
  year: number;
  month: number; // 1-12
}

export function currentMonth(tz: string): MonthKey {
  const p = zonedParts(new Date(), tz);
  return { year: p.year, month: p.month };
}

export function shiftMonth(m: MonthKey, delta: number): MonthKey {
  const idx = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function monthRange(m: MonthKey, tz: string): [Date, Date] {
  const next = shiftMonth(m, 1);
  return [zonedToUtc(m.year, m.month, 1, 0, 0, tz), zonedToUtc(next.year, next.month, 1, 0, 0, tz)];
}

export function monthIso(m: MonthKey) {
  return `${m.year}-${String(m.month).padStart(2, "0")}-01`;
}

export function monthLabel(m: MonthKey) {
  return new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function dayRange(date: Date, tz: string): [Date, Date] {
  const p = zonedParts(date, tz);
  const start = zonedToUtc(p.year, p.month, p.day, 0, 0, tz);
  const nextDay = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = zonedToUtc(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    0,
    0,
    tz,
  );
  return [start, end];
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD in the given zone. */
export function isoDate(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** HH:mm in the given zone. */
export function hhmm(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function dayHeading(date: Date, tz: string) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
}

/** 125 -> "2:05" */
export function formatMinutes(minutes: number) {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}

/** Seconds -> "1:02:03" */
export function formatElapsed(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function formatHours(minutes: number) {
  return (minutes / 60).toFixed(2);
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// ---------------------------------------------------------------------------
// Durations & rounding
// ---------------------------------------------------------------------------

/** Raw minutes of an entry, optionally clipped to [from, to). Running entries count up to `now`. */
export function entryMinutes(
  startedAt: string,
  endedAt: string | null,
  from?: Date,
  to?: Date,
  now: Date = new Date(),
) {
  let start = new Date(startedAt).getTime();
  let end = endedAt ? new Date(endedAt).getTime() : now.getTime();
  if (from) start = Math.max(start, from.getTime());
  if (to) end = Math.min(end, to.getTime());
  return Math.max(0, (end - start) / 60000);
}

export function roundMinutes(minutes: number, step: number, mode: RoundingMode) {
  // Work in whole minutes first so 59.9997 does not round oddly.
  const m = Math.round(minutes * 1000) / 1000;
  if (!step || step <= 1) return Math.round(m);
  const units = m / step;
  const rounded =
    mode === "up" ? Math.ceil(units - 1e-9) : mode === "down" ? Math.floor(units + 1e-9) : Math.round(units);
  return rounded * step;
}

/** Parse "YYYY-MM-DD" + "HH:mm" as wall-clock time in tz. */
export function parseLocal(date: string, time: string, tz: string) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return zonedToUtc(y, mo, d, h, mi, tz);
}
