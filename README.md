# Travel Map

A personal travel map app with public display pages and protected editing. It supports world countries and territories, U.S. states, visit statuses, country flags, city markers, years, and optional posts per place.

## Stack

- Next.js App Router and TypeScript
- SVG vector maps with `d3-geo`, `topojson-client`, `world-atlas`, and `us-atlas`
- Supabase-ready auth and Postgres JSONB storage
- Local readable JSON fallback in `data/maps`

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/m/rick`.

For the local JSON fallback, open `http://localhost:3000/m/rick/edit` and use `demo-owner-key` unless `MAP_OWNER_KEY` is set in `.env.local`.
After a successful save, the local owner key is remembered in the browser's `localStorage` for that map slug. Use the editor's `Forget key` button to remove it from the browser.

## City Lookup

The editor has a built-in local city list for demo data. To look up additional city coordinates dynamically, add a Geoapify key to `.env.local`:

```bash
GEOAPIFY_API_KEY=...
```

The key is used only from the server route at `/api/geocode/cities`, so it is not exposed to the browser.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Add these environment variables to Vercel and `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

4. Insert a row in `public.maps` where `owner_id` is your Supabase auth user id and `data` follows the JSON shape in `data/maps/rick.json`.

When Supabase variables are present, public reads come from Supabase and edits use Supabase Auth plus row-level security.
