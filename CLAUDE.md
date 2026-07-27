# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next.js dev server (defaults to `http://localhost:3000`); the demo map lives at `/m/rick`.
- `npm run build` — production build.
- `npm run start` — run the production build.
- `npm run lint` — ESLint (uses `eslint-config-next` via `eslint.config.mjs`).
- `npm run typecheck` — `tsc --noEmit`. There is no test script.

There is no test runner configured in `package.json` — do not invent one.

## Architecture

The app is a Next.js 16 App Router project (React 19, TypeScript strict). One travel "map" record (identified by a slug like `rick`) is rendered publicly at `/m/[slug]` and edited at `/m/[slug]/edit`. The same JSON shape (`TravelMapData`) is used everywhere — schema, storage, API, and UI all key off it.

### Dual storage backend (the critical pattern)

`lib/map-store.ts` is the single source of truth for reads and writes, and it transparently switches between two backends based on env vars:

- **Supabase mode** — active when both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. Reads come from the `public.maps` table; edits require a Supabase Auth bearer token, and row-level security in `supabase/schema.sql` enforces that only `auth.uid() = owner_id` can update. The PATCH route forwards the client's `Authorization` header into a per-request Supabase client.
- **Local JSON fallback** — `data/maps/<slug>.json` is always consulted on read when Supabase is unconfigured *or* returns no row, so the app keeps working before the Supabase table is seeded. Writes only target the JSON file when Supabase is *not* configured, authorized by an `x-owner-key` header matching `MAP_OWNER_KEY` (or `demo-owner-key` in non-production). Once Supabase is configured, edits go to Supabase only — the JSON acts as a read-only seed.

`hasSupabaseConfig()` is the switch, and both the API route (`app/api/maps/[slug]/route.ts`) and the editor component (`components/MapEditor.tsx`) branch on it. When changing auth, persistence, or the map schema, both code paths must stay in sync — schema changes also need `supabase/schema.sql` and an example file under `data/maps/`.

`assertSafeSlug` enforces `^[a-zA-Z0-9-]+$` before any filesystem or DB access; preserve that on any new code path that takes a slug.

### Schema is the contract

`lib/schema.ts` defines zod schemas for the entire map document (`mapDataSchema`, `mapRecordSchema`, `placeEntrySchema`, `citySchema`). The API route parses incoming PATCH bodies through `mapDataSchema` before calling `saveMapBySlug`, and `map-store.ts` re-parses on both read and write. New fields must be added to the zod schema first; TS types are inferred from it.

Place keys are ISO alpha-2 country codes (e.g. `FR`, `JP`) under `places.countries`, and `US-XX` codes under `places.states`. Helpers in `lib/geo.ts` (`countryTopoId`, `countryCodeFromTopoId`, `US_STATE_META`, `STATE_BY_FIPS`) translate between these keys and the numeric IDs used by the `world-atlas` and `us-atlas` TopoJSON files.

### Map rendering

`components/TravelMap.tsx` is a client component that imports the `world-atlas/countries-110m.json` and `us-atlas/states-10m.json` topologies directly, converts them via `topojson-client`, and projects with `d3-geo` (`geoEqualEarth` for world, `geoAlbersUsa` for US). It owns its own pan/zoom state via an SVG transform matrix — there is no external map library. Fill colors come from `STATUS_COLORS` in `lib/geo.ts`, keyed by the four `PLACE_STATUSES` defined in `lib/schema.ts`.

`components/MapEditor.tsx` reuses `<TravelMap>` for its preview tab, so changes to TravelMap props must remain backwards compatible with the editor's call site.

### City lookup

The editor debounces input and calls `/api/geocode/cities` (`app/api/geocode/cities/route.ts`), which proxies Geoapify server-side using `GEOAPIFY_API_KEY` so the key never reaches the browser. Without the key, the route returns `{ configured: false }` and the editor falls back to the hardcoded `CITY_OPTIONS_BY_PLACE` list in `lib/geo.ts`. Results are constrained to the selected country/state via Geoapify's `countrycode` filter plus a post-filter in `matchesPlace`.

## Conventions

- Path alias: `@/*` maps to the repo root (see `tsconfig.json`). Use it for cross-directory imports.
- The codebase prefers descriptive, full-word identifiers (e.g. `cityLookupMatchesCurrentQuery`, `normalizedCityToAdd`) and small functions — match this style rather than introducing terse names or large helpers.
- Server-only env vars (`MAP_OWNER_KEY`, `GEOAPIFY_API_KEY`) must never be referenced from client components.
