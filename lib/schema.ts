import { z } from "zod";

export const PLACE_STATUSES = ["visited", "seen", "planned", "want", "lived"] as const;
export type PlaceStatus = (typeof PLACE_STATUSES)[number];

export const citySchema = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  kind: z.enum(["visited", "lived", "want"])
});

export type City = z.infer<typeof citySchema>;

export const placeEntrySchema = z.object({
  name: z.string().optional(),
  status: z.enum(PLACE_STATUSES),
  years: z.array(z.number().int().min(0).max(3000)).optional().default([]),
  cities: z.array(citySchema).optional().default([]),
  post: z
    .object({
      title: z.string().optional(),
      body: z.string().optional()
    })
    .optional(),
  blogPostSlug: z.string().optional()
});

export type PlaceEntry = z.infer<typeof placeEntrySchema>;

export const mapDataSchema = z.object({
  version: z.number().int().min(1),
  profile: z.object({
    displayName: z.string().optional(),
    title: z.string().optional(),
    homeBase: z.string().optional()
  }),
  places: z.object({
    countries: z.record(z.string(), placeEntrySchema).default({}),
    states: z.record(z.string(), placeEntrySchema).default({})
  })
});

export type TravelMapData = z.infer<typeof mapDataSchema>;

export const mapRecordSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  slug: z.string(),
  title: z.string(),
  visibility: z.enum(["public", "private"]).default("public"),
  created_at: z.string(),
  updated_at: z.string(),
  data: mapDataSchema
});

export type TravelMapRecord = z.infer<typeof mapRecordSchema>;
