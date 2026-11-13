-- Time is Money — initial schema
-- Run this once in the Supabase SQL editor (or with `supabase db push`).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'member');
create type public.rounding_mode as enum ('nearest', 'up', 'down');

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table public.settings (
  id               int primary key default 1 check (id = 1),
  client_name      text        not null default 'Client',
  currency         text        not null default 'USD',
  default_rate     numeric(10,2) not null default 50,
  rounding_minutes int         not null default 0 check (rounding_minutes in (0, 1, 5, 6, 10, 15, 30, 60)),
  rounding_mode    public.rounding_mode not null default 'nearest',
  timezone         text        not null default 'Europe/Sarajevo',
  long_timer_hours int         not null default 10 check (long_timer_hours between 1 and 48),
  updated_at       timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.user_role not null default 'member',
  hourly_rate numeric(10,2) not null default 50 check (hourly_rate >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lookup lists: buildings (sites) and scopes (type of work)
-- ---------------------------------------------------------------------------
create table public.buildings (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  archived   boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.scopes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  archived   boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.buildings (name, sort_order) values
  ('General', 0),
  ('Billingsley - 1722', 1),
  ('Creative - 16825', 2),
  ('CRES - 29970', 3),
  ('Granite - 550', 4),
  ('Philtower - 427', 5),
  ('Quadrant - 750', 6),
  ('Overhead', 7);

insert into public.scopes (name, sort_order) values
  ('Internet', 0),
  ('Phone', 1),
  ('O365', 2);

-- ---------------------------------------------------------------------------
-- Time entries
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  work          text not null default '',
  building_id   uuid references public.buildings (id) on delete set null,
  scope_id      uuid references public.scopes (id) on delete set null,
  rate_snapshot numeric(10,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ended_after_started check (ended_at is null or ended_at > started_at)
);

-- Only one running timer per person, enforced by the database.
create unique index time_entries_one_running
  on public.time_entries (user_id) where ended_at is null;

create index time_entries_user_started on public.time_entries (user_id, started_at desc);
create index time_entries_started on public.time_entries (started_at);

-- Realtime: send full rows (needed for filtered UPDATE/DELETE events).
alter table public.time_entries replica identity full;

-- ---------------------------------------------------------------------------
-- Month locks (first day of month, in the settings time zone)
-- ---------------------------------------------------------------------------
create table public.month_locks (
  month     date primary key check (extract(day from month) = 1),
  locked_at timestamptz not null default now(),
  locked_by uuid references public.profiles (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.month_of(ts timestamptz)
returns date
language sql stable security definer set search_path = public
as $$
  select date_trunc('month', ts at time zone (select timezone from public.settings where id = 1))::date;
$$;

create or replace function public.is_month_locked(ts timestamptz)
returns boolean
language sql stable security definer set search_path = public
as $$
  select ts is not null and exists (
    select 1 from public.month_locks where month = public.month_of(ts)
  );
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- New auth user -> profile. The very first user becomes admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, email, full_name, role, hourly_rate)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    case when first_user then 'admin'::public.user_role else 'member'::public.user_role end,
    (select default_rate from public.settings where id = 1)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Members may only edit their own name; role, rate and active are admin-only.
-- (auth.uid() is null for the service role / SQL editor, which are trusted.)
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.hourly_rate is distinct from old.hourly_rate
       or new.active is distinct from old.active
       or new.email is distinct from old.email then
      raise exception 'Only an admin can change role, rate or status';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Time entry guard: locked months, ownership, rate snapshot.
create or replace function public.guard_time_entry()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if public.is_month_locked(old.started_at) or public.is_month_locked(old.ended_at) then
      raise exception 'This month is locked. Ask an admin to unlock it first.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if public.is_month_locked(new.started_at) or public.is_month_locked(new.ended_at) then
    raise exception 'This month is locked. Ask an admin to unlock it first.';
  end if;

  if auth.uid() is not null and not public.is_admin() then
    if new.user_id is distinct from auth.uid() then
      raise exception 'You can only track your own time';
    end if;
    if tg_op = 'UPDATE' and new.rate_snapshot is distinct from old.rate_snapshot then
      raise exception 'Only an admin can change the rate of an entry';
    end if;
    if tg_op = 'INSERT' then
      new.rate_snapshot := null; -- always taken from the profile below
    end if;
  end if;

  if new.rate_snapshot is null then
    select hourly_rate into new.rate_snapshot from public.profiles where id = new.user_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger time_entries_guard
  before insert or update or delete on public.time_entries
  for each row execute function public.guard_time_entry();

-- ---------------------------------------------------------------------------
-- Timer RPCs (server clock is the single source of truth)
-- ---------------------------------------------------------------------------
create or replace function public.start_timer(
  p_building_id uuid default null,
  p_scope_id uuid default null,
  p_work text default ''
)
returns public.time_entries
language plpgsql security invoker set search_path = public
as $$
declare
  result public.time_entries;
begin
  -- Starting a new timer stops the one already running.
  update public.time_entries
     set ended_at = now()
   where user_id = auth.uid() and ended_at is null;

  insert into public.time_entries (user_id, started_at, building_id, scope_id, work)
  values (auth.uid(), now(), p_building_id, p_scope_id, coalesce(p_work, ''))
  returning * into result;

  return result;
end;
$$;

create or replace function public.stop_timer()
returns public.time_entries
language plpgsql security invoker set search_path = public
as $$
declare
  result public.time_entries;
begin
  update public.time_entries
     set ended_at = now()
   where user_id = auth.uid() and ended_at is null
  returning * into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.settings     enable row level security;
alter table public.profiles     enable row level security;
alter table public.buildings    enable row level security;
alter table public.scopes       enable row level security;
alter table public.time_entries enable row level security;
alter table public.month_locks  enable row level security;

-- settings
create policy "settings: read" on public.settings
  for select to authenticated using (true);
create policy "settings: admin update" on public.settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles
create policy "profiles: read self or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles: update self or admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- buildings / scopes
create policy "buildings: read" on public.buildings
  for select to authenticated using (true);
create policy "buildings: admin write" on public.buildings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "scopes: read" on public.scopes
  for select to authenticated using (true);
create policy "scopes: admin write" on public.scopes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- time entries
create policy "entries: read own or admin" on public.time_entries
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "entries: insert own or admin" on public.time_entries
  for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
create policy "entries: update own or admin" on public.time_entries
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "entries: delete own or admin" on public.time_entries
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- month locks
create policy "locks: read" on public.month_locks
  for select to authenticated using (true);
create policy "locks: admin write" on public.month_locks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.time_entries;
