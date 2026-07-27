import { NextRequest } from "next/server";
import { getMapBySlug, saveMapBySlug } from "@/lib/map-store";
import { mapDataSchema } from "@/lib/schema";

type RouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const { slug } = await params;
  const map = await getMapBySlug(slug);

  if (!map) {
    return Response.json({ error: "Map not found" }, { status: 404 });
  }

  return Response.json(map);
}

export async function PATCH(request: NextRequest, { params }: RouteProps) {
  const { slug } = await params;
  const body = await request.json().catch(() => null);
  const parsed = mapDataSchema.safeParse(body?.data);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid map data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await saveMapBySlug(slug, parsed.data, {
    authorization: request.headers.get("authorization"),
    ownerKey: request.headers.get("x-owner-key")
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json(result.map);
}
