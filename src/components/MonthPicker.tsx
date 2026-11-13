"use client";

import { monthLabel, shiftMonth, type MonthKey } from "@/lib/time";

export function MonthPicker({
  value,
  onChange,
  locked,
}: {
  value: MonthKey;
  onChange: (m: MonthKey) => void;
  locked?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <button className="btn-secondary h-9 w-9 px-0" aria-label="Previous month" onClick={() => onChange(shiftMonth(value, -1))}>
        ‹
      </button>
      <div className="min-w-36 text-center font-medium">
        {monthLabel(value)}
        {locked && (
          <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 align-middle text-[11px] font-medium text-accent">
            Locked
          </span>
        )}
      </div>
      <button className="btn-secondary h-9 w-9 px-0" aria-label="Next month" onClick={() => onChange(shiftMonth(value, 1))}>
        ›
      </button>
    </div>
  );
}
