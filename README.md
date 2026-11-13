# Time is Money

Track work hours on any device and bill them at the end of the month.

- **One timer, every device.** Start on the laptop, stop on the phone. The server clock is the source of truth and changes sync live (Supabase Realtime).
- **One running timer per person**, enforced by the database. Starting a new timer stops the previous one.
- **Building + Scope + Work** for every entry, the same columns as the original *Time Sheet* spreadsheet.
- **Monthly report** (admin): hours and amount per person, per building, per scope. Export to **Excel** or **CSV** in the original column layout.
- **Rates per person**, copied into every entry, so changing a rate never changes months that are already billed.
- **Rounding** per entry (none / 5 / 6 / 10 / 15 / 30 / 60 min; nearest, up or down).
- **Month lock** after billing: nobody can add or change entries in a locked month (enforced in the database).
- **Forgot-to-stop warning** after N hours, with a one-tap fix of the real stop time.
- **Entries crossing midnight or month end** are handled; the report splits them at the month boundary.
- **Installable PWA** for iPhone and Android.

Stack: Next.js 16 (App Router) · Supabase (Postgres, Auth, Realtime, RLS) · Tailwind CSS 4 · Vercel.

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run the files in [`supabase/migrations`](supabase/migrations) in order.
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up" (people join by invitation only).
4. **Authentication → URL Configuration**
   - *Site URL*: your production URL, e.g. `https://time-is-money-sigma.vercel.app`
   - *Redirect URLs*: add `https://time-is-money-sigma.vercel.app/**` and `http://localhost:3000/**`
5. **Authentication → Email Templates** (recommended, makes login work inside the installed phone app):
   - **Magic Link** — add the code so people can type it into the app:
     ```html
     <h2>Your sign-in code</h2>
     <p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
     <p>Or <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">tap here to sign in</a>.</p>
     ```
   - **Invite user**:
     ```html
     <h2>You have been invited to Time is Money</h2>
     <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite">Accept the invitation</a></p>
     ```
6. **Authentication → Users → Add user → Create new user**: create **your own** account with a password.
   The first user automatically becomes **admin**.

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API Keys**:

| Variable | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`). Server only; used to send invitations |
| `NEXT_PUBLIC_SITE_URL` | Optional. Public URL used in invitation links |

### 3. Run locally

```bash
npm install
npm run dev
```

### 4. Deploy to Vercel

Import the GitHub repo in Vercel, add the same environment variables, deploy.

### 5. Install on the phone

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** ⋮ → *Install app*

---

## How it works

| Table | Purpose |
| --- | --- |
| `settings` | Client name, currency, default rate, rounding, time zone, long-timer warning |
| `profiles` | One per user: name, role (`admin` / `member`), hourly rate, active |
| `buildings`, `scopes` | Pick lists (editable in Settings; hide instead of delete) |
| `time_entries` | `started_at`, `ended_at` (null = running), work, building, scope, `rate_snapshot` |
| `month_locks` | Locked months (first day of month in the settings time zone) |

- `start_timer()` / `stop_timer()` are Postgres functions that use the **database clock** (`now()`), so device clocks don't matter.
- A partial unique index allows only one running entry per person.
- Row Level Security: members see and edit only their own entries; admins see everything.
- A trigger blocks changes in locked months, blocks members from changing rates or roles, and copies the person's current rate into each new entry.
- Amount per entry = rounded minutes / 60 × `rate_snapshot`. Rounding is applied per entry (after splitting at the month boundary), so every line on the export can be checked by hand.

## Roles

- **Member:** Timer, own entries, own account.
- **Admin:** everything a member can do, plus all entries, the monthly report and export, month lock, billing settings, people (rates, roles, invites), buildings and scopes.
