# Outlet Brain

Voice-first knowledge and operations app for cafés. Next.js (App Router) +
Supabase.

No UI yet — this repo currently just wires up the database: migrations for
every table in `docs/Outlet_Brain_Schema_Living_Doc.md`, a seed script that
loads the Musafir Cafe dummy data, and the Supabase client plumbing the app
will use once UI work starts.

See [`supabase/SCHEMA_NOTES.md`](supabase/SCHEMA_NOTES.md) for every place
the migrations deviate from the doc's literal field lists, and why.

## Prerequisites

- Node.js 20+
- A Supabase project (free tier is fine) — [supabase.com/dashboard](https://supabase.com/dashboard)
- Optionally, the [Supabase CLI](https://supabase.com/docs/guides/cli) for local dev / pushing migrations

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` from your Supabase project's **Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, used by the seed script. Never expose this to the browser.

### Run the migrations

With the Supabase CLI, linked to your project:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

Or paste the contents of each file in `supabase/migrations/` into the
Supabase dashboard's SQL Editor, in filename order (they're numbered/dated
so the order matters — later files reference tables created in earlier
ones).

### Enable phone auth

The auth strategy is Supabase Auth with phone OTP. In the dashboard:
**Authentication → Providers → Phone** — enable it, and configure a real
SMS provider (Twilio, MessageBird, Vonage) before going to production. For
local CLI dev, the test OTP (`123456`) works without a provider.

### Seed the Musafir Cafe dummy data

Two ways to do this — pick based on whether you want the service role key
touching anything outside your Supabase dashboard:

**No API key at all (recommended):** open Supabase Studio → SQL Editor,
paste in the contents of [`supabase/seed/seed.sql`](supabase/seed/seed.sql),
and run it. It runs as the database owner (bypasses RLS, can create the 3
staff auth accounts directly), is wrapped in one transaction, and is safe
to run more than once — every insert is guarded by `WHERE NOT EXISTS` on a
natural key. Ends with a row-count summary per table so you can confirm it
worked right in the results pane.

**Node script (needs the service role key):**

```bash
npm run seed
```

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` — it calls the auth
admin API to create users and needs to bypass RLS to write everything else.
That key only ever needs to live in your local `.env.local`, never
anywhere else. Also safe to re-run (find-or-create, keyed on natural
identifiers).

### Run the app

```bash
npm run dev
```

## Deploying to Vercel

Push this repo to GitHub (already wired to
`https://github.com/Swasyrups/cafe-brain.git`), then import it in Vercel.
Set the same three env vars from `.env.local` in the Vercel project
settings (Production + Preview). `SUPABASE_SERVICE_ROLE_KEY` only needs to
be there if a server-side route uses `lib/supabase/admin.ts` — the seed
script itself runs locally/in CI, not on Vercel.

## Project structure

```
app/                      Next.js App Router pages
lib/supabase/
  client.ts               Browser client (anon key)
  server.ts                Server Component / Route Handler client (anon key, cookie-aware)
  admin.ts                  Service-role client — server-only, bypasses RLS
supabase/
  config.toml              Supabase CLI config (local dev)
  migrations/               One SQL file per schema section, in order
  seed/seed.ts               Loads the 8 Musafir Cafe dummy-data docs
  SCHEMA_NOTES.md            Every deviation from the schema doc, and why
docs/                      Schema living doc, dummy data, UI mockups (source material — not read by the app)
```
