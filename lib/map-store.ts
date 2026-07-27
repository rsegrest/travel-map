import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mapDataSchema, mapRecordSchema, type TravelMapData, type TravelMapRecord } from "@/lib/schema";

type SaveAuth = {
  authorization: string | null;
  ownerKey: string | null;
};

type SaveResult =
  | { ok: true; map: TravelMapRecord }
  | { ok: false; status: number; error: string };

const DATA_DIR = path.join(process.cwd(), "data", "maps");

export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function isEditingDisabledInProduction() {
  return process.env.VERCEL_ENV === "production";
}

function assertSafeSlug(slug: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(slug)) {
    throw new Error("Invalid map slug");
  }
}

function getSupabaseClient(authorization?: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    global: authorization ? { headers: { Authorization: authorization } } : undefined
  });
}

function dbRowToMap(row: Record<string, unknown>): TravelMapRecord {
  return mapRecordSchema.parse(row);
}

async function readLocalMap(slug: string) {
  assertSafeSlug(slug);
  const filePath = path.join(DATA_DIR, `${slug}.json`);
  const raw = await fs.readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });

  if (!raw) {
    return null;
  }

  return mapRecordSchema.parse(JSON.parse(raw));
}

async function writeLocalMap(map: TravelMapRecord) {
  assertSafeSlug(map.slug);
  const filePath = path.join(DATA_DIR, `${map.slug}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(map, null, 2)}\n`, "utf8");
}

export async function getMapBySlug(slug: string): Promise<TravelMapRecord | null> {
  assertSafeSlug(slug);

  if (hasSupabaseConfig()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase!
      .from("maps")
      .select("id, owner_id, slug, title, visibility, created_at, updated_at, data")
      .eq("slug", slug)
      .single();

    if (!error && data) {
      return dbRowToMap(data);
    }
  }

  return readLocalMap(slug);
}

export async function saveMapBySlug(
  slug: string,
  data: TravelMapData,
  auth: SaveAuth
): Promise<SaveResult> {
  assertSafeSlug(slug);
  const parsedData = mapDataSchema.parse(data);

  if (hasSupabaseConfig()) {
    const supabase = getSupabaseClient(auth.authorization);

    if (!auth.authorization || !supabase) {
      return { ok: false, status: 401, error: "Sign in to edit this map." };
    }

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { ok: false, status: 401, error: "Your edit session is not valid." };
    }

    const { data: updated, error } = await supabase
      .from("maps")
      .update({
        data: parsedData,
        title: parsedData.profile.title || "Travel Map",
        updated_at: new Date().toISOString()
      })
      .eq("slug", slug)
      .select("id, owner_id, slug, title, visibility, created_at, updated_at, data")
      .single();

    if (error || !updated) {
      return { ok: false, status: 403, error: "You do not have permission to edit this map." };
    }

    return { ok: true, map: dbRowToMap(updated) };
  }

  const expectedOwnerKey =
    process.env.MAP_OWNER_KEY || (process.env.NODE_ENV !== "production" ? "demo-owner-key" : "");

  if (!expectedOwnerKey || auth.ownerKey !== expectedOwnerKey) {
    return { ok: false, status: 401, error: "Enter the owner key to edit this map." };
  }

  const existing = await readLocalMap(slug);

  if (!existing) {
    return { ok: false, status: 404, error: "Map not found." };
  }

  const nextMap: TravelMapRecord = {
    ...existing,
    title: parsedData.profile.title || existing.title,
    updated_at: new Date().toISOString(),
    data: parsedData
  };

  await writeLocalMap(nextMap);

  return { ok: true, map: nextMap };
}
