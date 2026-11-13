"use client";

import type { Lookup } from "@/lib/types";

export function LookupSelect({
  id,
  items,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id?: string;
  items: Lookup[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  // Keep an archived item visible if it is the current value.
  const visible = items.filter((i) => !i.archived || i.id === value);
  return (
    <select
      id={id}
      className="input"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{placeholder}</option>
      {visible.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </select>
  );
}
