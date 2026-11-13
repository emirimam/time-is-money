export type Role = "admin" | "member";
export type RoundingMode = "nearest" | "up" | "down";

export interface Settings {
  id: number;
  client_name: string;
  currency: string;
  default_rate: number;
  rounding_minutes: number;
  rounding_mode: RoundingMode;
  timezone: string;
  long_timer_hours: number;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  hourly_rate: number;
  active: boolean;
}

export interface Lookup {
  id: string;
  name: string;
  archived: boolean;
  sort_order: number;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  work: string;
  building_id: string | null;
  scope_id: string | null;
  rate_snapshot: number | null;
  created_at: string;
  updated_at: string;
}

export interface MonthLock {
  month: string; // YYYY-MM-01
  locked_at: string;
  locked_by: string | null;
}
