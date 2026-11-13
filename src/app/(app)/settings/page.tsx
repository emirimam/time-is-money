"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { inviteUser } from "./actions";
import type { Lookup, Profile, RoundingMode, Role, Settings } from "@/lib/types";

const TIMEZONES = ["Europe/Sarajevo", "Europe/London", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "UTC"];

export default function SettingsPage() {
  const { isAdmin } = useApp();
  return (
    <div className="space-y-8">
      <Account />
      {isAdmin && (
        <>
          <Billing />
          <People />
          <LookupManager table="buildings" title="Buildings" />
          <LookupManager table="scopes" title="Scopes" />
        </>
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="px-1 font-semibold">{title}</h2>
      {description && <p className="mb-2 px-1 text-sm text-muted">{description}</p>}
      <div className={`card p-4 ${description ? "" : "mt-2"}`}>{children}</div>
    </section>
  );
}

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={`text-sm ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</p>;
}

// ---------------------------------------------------------------------------

function Account() {
  const { supabase, profile } = useApp();
  const router = useRouter();
  const welcome = useSearchParams().get("welcome");
  const [name, setName] = useState(profile.full_name);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (name.trim() !== profile.full_name) {
      const { error } = await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", profile.id);
      if (error) {
        setBusy(false);
        return setMsg({ ok: false, text: error.message });
      }
    }
    if (password) {
      if (password.length < 8) {
        setBusy(false);
        return setMsg({ ok: false, text: "Password must be at least 8 characters." });
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setBusy(false);
        return setMsg({ ok: false, text: error.message });
      }
      setPassword("");
    }
    setBusy(false);
    setMsg({ ok: true, text: "Saved." });
    router.refresh();
  }

  return (
    <Section title="Your account">
      {welcome && (
        <p className="mb-4 rounded-lg bg-accent-soft p-3 text-sm text-accent">
          Welcome! Set a password so you can sign in on your other devices.
        </p>
      )}
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="label" htmlFor="a-email">Email</label>
          <input id="a-email" className="input" value={profile.email} disabled />
        </div>
        <div>
          <label className="label" htmlFor="a-name">Name</label>
          <input id="a-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="a-pass">New password</label>
          <input id="a-pass" type="password" autoComplete="new-password" className="input" value={password}
            placeholder="Leave empty to keep the current one" onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy}>Save</button>
          <Status msg={msg} />
        </div>
      </form>
      <form action="/auth/signout" method="post" className="mt-4 border-t border-border pt-4">
        <button className="btn-secondary">Sign out</button>
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function Billing() {
  const { supabase, settings } = useApp();
  const router = useRouter();
  const [form, setForm] = useState<Settings>(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from("settings")
      .update({
        client_name: form.client_name.trim() || "Client",
        currency: form.currency.trim().toUpperCase() || "USD",
        default_rate: Number(form.default_rate) || 0,
        rounding_minutes: Number(form.rounding_minutes),
        rounding_mode: form.rounding_mode,
        timezone: form.timezone,
        long_timer_hours: Number(form.long_timer_hours) || 10,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setMsg({ ok: true, text: "Saved." });
      router.refresh();
    }
  }

  const zones = TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES];

  return (
    <Section title="Billing" description="Rates and rounding used for the monthly total.">
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="b-client">Client</label>
            <input id="b-client" className="input" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="b-cur">Currency</label>
            <input id="b-cur" className="input uppercase" maxLength={3} value={form.currency}
              onChange={(e) => set("currency", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="b-round">Round each entry to</label>
            <select id="b-round" className="input" value={form.rounding_minutes}
              onChange={(e) => set("rounding_minutes", Number(e.target.value))}>
              <option value={0}>No rounding</option>
              {[5, 6, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="b-mode">Rounding</label>
            <select id="b-mode" className="input" value={form.rounding_mode} disabled={!form.rounding_minutes}
              onChange={(e) => set("rounding_mode", e.target.value as RoundingMode)}>
              <option value="nearest">Nearest</option>
              <option value="up">Always up</option>
              <option value="down">Always down</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="b-rate">Default rate / h</label>
            <input id="b-rate" type="number" min={0} step="0.01" className="input tabular" value={form.default_rate}
              onChange={(e) => set("default_rate", Number(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="b-long">Warn after (h)</label>
            <input id="b-long" type="number" min={1} max={48} className="input tabular" value={form.long_timer_hours}
              onChange={(e) => set("long_timer_hours", Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="b-tz">Time zone</label>
          <select id="b-tz" className="input" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted">
          The default rate is used for new people. Each person&apos;s own rate is set below; changing it only affects new entries.
        </p>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy}>Save</button>
          <Status msg={msg} />
        </div>
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function People() {
  const { supabase, profile: me, settings } = useApp();
  const [people, setPeople] = useState<Profile[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [invite, setInvite] = useState({ email: "", name: "", rate: String(settings.default_rate) });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    setPeople((data as Profile[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function update(p: Profile, patch: Partial<Profile>) {
    setMsg(null);
    const { error } = await supabase.from("profiles").update(patch).eq("id", p.id);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setMsg({ ok: true, text: `Updated ${p.full_name || p.email}.` });
      load();
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await inviteUser(invite.email, invite.name, Number(invite.rate));
    setBusy(false);
    setMsg({ ok: res.ok, text: res.message });
    if (res.ok) {
      setInvite({ email: "", name: "", rate: String(settings.default_rate) });
      load();
    }
  }

  return (
    <Section title="People" description="Each person tracks their own time. Only admins see everyone and the report.">
      <ul className="divide-y divide-border">
        {people.map((p) => (
          <PersonRow key={p.id} person={p} isMe={p.id === me.id} currency={settings.currency} onUpdate={update} />
        ))}
      </ul>

      <form onSubmit={sendInvite} className="mt-4 space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium">Invite someone</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem]">
          <input className="input" type="email" required placeholder="Email" value={invite.email}
            onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <input className="input" placeholder="Name" value={invite.name}
            onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          <input className="input tabular" type="number" min={0} step="0.01" placeholder="Rate" value={invite.rate}
            onChange={(e) => setInvite({ ...invite, rate: e.target.value })} />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy}>{busy ? "Sending…" : "Send invite"}</button>
          <Status msg={msg} />
        </div>
      </form>
    </Section>
  );
}

function PersonRow({
  person,
  isMe,
  currency,
  onUpdate,
}: {
  person: Profile;
  isMe: boolean;
  currency: string;
  onUpdate: (p: Profile, patch: Partial<Profile>) => void;
}) {
  const [rate, setRate] = useState(String(person.hourly_rate));
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${person.active ? "" : "text-muted line-through"}`}>
          {person.full_name || person.email} {isMe && <span className="text-xs font-normal text-muted">(you)</span>}
        </p>
        <p className="truncate text-xs text-muted">{person.email}</p>
      </div>
      <div className="flex items-center gap-1">
        <input
          aria-label="Hourly rate"
          type="number"
          min={0}
          step="0.01"
          className="input tabular w-24 py-1.5"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onBlur={() => Number(rate) !== Number(person.hourly_rate) && onUpdate(person, { hourly_rate: Number(rate) })}
        />
        <span className="text-xs text-muted">{currency}/h</span>
      </div>
      <select
        aria-label="Role"
        className="input w-auto py-1.5"
        value={person.role}
        disabled={isMe}
        onChange={(e) => onUpdate(person, { role: e.target.value as Role })}
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>
      {!isMe && (
        <button className="btn-secondary py-1.5" onClick={() => onUpdate(person, { active: !person.active })}>
          {person.active ? "Disable" : "Enable"}
        </button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------

function LookupManager({ table, title }: { table: "buildings" | "scopes"; title: string }) {
  const { supabase } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<Lookup[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from(table).select("*").order("sort_order").order("name");
    setItems((data as Lookup[]) ?? []);
  }, [supabase, table]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error } = await p;
    if (error) setError(error.message);
    await load();
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const sort = Math.max(-1, ...items.map((i) => i.sort_order)) + 1;
    await run(supabase.from(table).insert({ name: name.trim(), sort_order: sort }));
    setName("");
  }

  async function move(i: number, dir: -1 | 1) {
    const a = items[i];
    const b = items[i + dir];
    if (!a || !b) return;
    await run(supabase.from(table).update({ sort_order: b.sort_order }).eq("id", a.id));
    await run(supabase.from(table).update({ sort_order: a.sort_order }).eq("id", b.id));
  }

  return (
    <Section title={title}>
      <ul className="divide-y divide-border">
        {items.map((item, i) => (
          <li key={item.id} className="flex items-center gap-2 py-2">
            <input
              className={`input flex-1 py-1.5 ${item.archived ? "text-muted line-through" : ""}`}
              defaultValue={item.name}
              aria-label={`${title} name`}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== item.name) run(supabase.from(table).update({ name: v }).eq("id", item.id));
              }}
            />
            <button className="btn-secondary h-8 w-8 px-0" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button className="btn-secondary h-8 w-8 px-0" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}>↓</button>
            <button
              className="btn-secondary py-1.5 text-xs"
              onClick={() => run(supabase.from(table).update({ archived: !item.archived }).eq("id", item.id))}
            >
              {item.archived ? "Restore" : "Hide"}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input className="input" placeholder={`New ${title.toLowerCase().slice(0, -1)}`} value={name}
          onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary">Add</button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Section>
  );
}
