"use client";

import { useMemo, useState } from "react";
import { useApp } from "./AppProvider";
import { Modal } from "./Modal";
import { LookupSelect } from "./LookupSelect";
import { formatMinutes, hhmm, isoDate, parseLocal } from "@/lib/time";
import type { Profile, TimeEntry } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;

export function EntryEditor({
  entry,
  people,
  defaultUserId,
  defaultDate,
  onClose,
  onSaved,
}: {
  entry: TimeEntry | null; // null = new entry
  people?: Profile[]; // admin: who the new entry is for
  defaultUserId?: string;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { supabase, tz, buildings, scopes, profile, isAdmin } = useApp();
  const running = !!entry && !entry.ended_at;

  const initialStart = entry ? new Date(entry.started_at) : null;
  const initialEnd = entry?.ended_at ? new Date(entry.ended_at) : null;

  const [userId, setUserId] = useState(entry?.user_id ?? defaultUserId ?? profile.id);
  const [date, setDate] = useState(initialStart ? isoDate(initialStart, tz) : defaultDate ?? isoDate(new Date(), tz));
  const [start, setStart] = useState(initialStart ? hhmm(initialStart, tz) : "09:00");
  const [end, setEnd] = useState(initialEnd ? hhmm(initialEnd, tz) : running ? "" : "10:00");
  const [buildingId, setBuildingId] = useState<string | null>(entry?.building_id ?? null);
  const [scopeId, setScopeId] = useState<string | null>(entry?.scope_id ?? null);
  const [work, setWork] = useState(entry?.work ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computed = useMemo(() => {
    if (!date || !start) return null;
    const s = parseLocal(date, start, tz);
    if (!end) return { s, e: null as Date | null, nextDay: false };
    let e = parseLocal(date, end, tz);
    let nextDay = false;
    if (e <= s) {
      // Crossed midnight: same wall-clock time on the following day.
      const [y, m, d] = date.split("-").map(Number);
      const next = new Date(Date.UTC(y, m - 1, d) + DAY);
      e = parseLocal(next.toISOString().slice(0, 10), end, tz);
      nextDay = true;
    }
    return { s, e, nextDay };
  }, [date, start, end, tz]);

  const minutes = computed?.e ? (computed.e.getTime() - computed.s.getTime()) / 60000 : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!computed) return;
    if (!computed.e && !running) {
      setError("Set an end time.");
      return;
    }
    if (minutes !== null && minutes > 24 * 60) {
      setError("An entry can't be longer than 24 hours.");
      return;
    }
    if (computed.s.getTime() > Date.now() + 60_000 || (computed.e && computed.e.getTime() > Date.now() + 60_000)) {
      setError("Times can't be in the future.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      started_at: computed.s.toISOString(),
      ended_at: computed.e ? computed.e.toISOString() : null,
      building_id: buildingId,
      scope_id: scopeId,
      work: work.trim(),
    };
    const { error } = entry
      ? await supabase.from("time_entries").update(payload).eq("id", entry.id)
      : await supabase.from("time_entries").insert({ ...payload, user_id: userId });
    setBusy(false);
    if (error) setError(error.message);
    else {
      onSaved();
      onClose();
    }
  }

  async function remove() {
    if (!entry) return;
    setBusy(true);
    const { error } = await supabase.from("time_entries").delete().eq("id", entry.id);
    setBusy(false);
    if (error) setError(error.message);
    else {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal title={entry ? "Edit entry" : "Add entry"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {!entry && isAdmin && people && people.length > 1 && (
          <div>
            <label className="label" htmlFor="ee-person">Person</label>
            <select id="ee-person" className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label" htmlFor="ee-date">Date</label>
          <input id="ee-date" type="date" className="input" value={date} required onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ee-start">Start</label>
            <input id="ee-start" type="time" className="input tabular" value={start} required
              onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ee-end">Stop</label>
            <input id="ee-end" type="time" className="input tabular" value={end} required={!running}
              onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <p className="-mt-2 text-sm text-muted tabular">
          {running && !end
            ? "Still running — set a stop time to end it."
            : minutes !== null
              ? `${formatMinutes(minutes)} h${computed?.nextDay ? " · ends the next day" : ""}`
              : ""}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ee-building">Building</label>
            <LookupSelect id="ee-building" items={buildings} value={buildingId} onChange={setBuildingId} placeholder="—" />
          </div>
          <div>
            <label className="label" htmlFor="ee-scope">Scope</label>
            <LookupSelect id="ee-scope" items={scopes} value={scopeId} onChange={setScopeId} placeholder="—" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="ee-work">Work</label>
          <input id="ee-work" className="input" value={work} placeholder="What did you do?"
            onChange={(e) => setWork(e.target.value)} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2 pt-1">
          {entry &&
            (confirmDelete ? (
              <button type="button" className="btn-danger" onClick={remove} disabled={busy}>
                Really delete?
              </button>
            ) : (
              <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                Delete
              </button>
            ))}
          <button className="btn-primary ml-auto min-w-28" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
