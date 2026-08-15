# Travel Map

An interactive, self-hostable travel map for tracking everywhere you've been — **world countries, territories, and U.S. states** on a globe and a 2D US map, with visit statuses, city markers, years, and optional write-ups per place.

Built to be yours: it ships with demo data, runs locally in seconds, and reads real data from **Supabase** at runtime (or a local JSON file) once you add your own places.

## Live demo

See it in action: [**travel-map-ivory.vercel.app**](https://travel-map-ivory.vercel.app)

## Features

- **🌍 3D globe + 🇺🇸 2D US map** — toggle between world and US views
- **Rich place data** — countries, territories, and states with visit statuses (visited, lived, seen, planned, want), city markers, years, and flags
- **Per-place write-ups** — attach a short post / story to any location
- **Search & fly-to** — type-ahead search that zooms straight to a country or state
- **Protected editing** — a password-protected editor for managing your map; edits persist to Supabase with row-level security, or to a local JSON file
- **Dark, glassy theme** — aurora-inspired, matches a developer-portfolio aesthetic

## Stack

- **Next.js** (App Router) + TypeScript
- **d3-geo / topojson-client** with `world-atlas` and `us-atlas` for vector maps
- **react-globe.gl** for the 3D world view
- **Supabase** (Postgres + JSONB + row-level security) for data; local JSON fallback

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/m/rick`.

Out of the box this serves **demo data** so you can see it working immediately. To edit it locally, open `/m/rick/edit` and use the owner key (default `demo-owner-key`, or set `MAP_OWNER_KEY` in `.env.local`).

## Make it yours

You can start a brand-new map in two ways — your call:

**Option A — local JSON (simplest).** Edit `data/maps/<slug>.json` directly, or use the in-app editor. No database required.

**Option B — Supabase (multi-device, edits from anywhere).**

1. Create a free Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Add env vars (Vercel or `.env.local`):

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```

4. Insert a row into `public.maps` — `owner_id` is your Supabase auth user id, `data` follows the shape in `data/maps/rick.json`.

When Supabase is configured, public reads come from Supabase and edits require Supabase Auth (row-level security guards writes). Otherwise the app falls back to local JSON.

## City lookup

The editor ships with a built-in city list for demo data. For dynamic coordinate lookup, add a [Geoapify](https://www.geoapify.com/) key:

```bash
GEOAPIFY_API_KEY=...
```

It's used only by the server route at `/api/geocode/cities` — never exposed to the browser.

## Project layout

```
app/            Next.js routes (display, edit, admin)
components/     TravelMap, UsMap, MapEditor
lib/            data access (map-store), geo, schema, years
data/maps/      local JSON fallback (demo data)
supabase/       SQL schema for the maps table
public/         US state flag assets
```

## License

MIT — use it, fork it, make it your own.

---

*Demo data is a stand-in: replace it with your own places and your own stories. That's the point.*
