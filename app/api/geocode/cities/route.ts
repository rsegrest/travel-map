import { NextRequest } from "next/server";
import { countryName, type CityOption, normalizeSearchTerm, US_STATE_META } from "@/lib/geo";

type GeoapifyResult = {
  city?: string;
  name?: string;
  formatted?: string;
  lat?: number | string;
  lon?: number | string;
  state?: string;
  state_code?: string;
  country_code?: string;
};

const lookupCache = new Map<string, CityOption[]>();

export async function GET(request: NextRequest) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() || "";
  const placeKey = searchParams.get("placeKey")?.trim().toUpperCase() || "";

  if (query.length < 2 || !placeKey) {
    return Response.json({ suggestions: [], configured: Boolean(apiKey) });
  }

  if (!apiKey) {
    return Response.json({ suggestions: [], configured: false });
  }

  const cacheKey = `${placeKey}:${query.toLowerCase()}`;
  const cached = lookupCache.get(cacheKey);

  if (cached) {
    return Response.json({ suggestions: cached, configured: true, cached: true });
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", buildLookupText(placeKey, query));
  url.searchParams.set("type", "city");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "8");
  url.searchParams.set("apiKey", apiKey);

  const countryCode = placeKey.startsWith("US-") ? "us" : placeKey.toLowerCase();
  if (/^[a-z]{2}$/.test(countryCode)) {
    url.searchParams.set("filter", `countrycode:${countryCode}`);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    next: { revalidate: 60 * 60 * 24 * 30 }
  });

  if (!response.ok) {
    return Response.json(
      { suggestions: [], configured: true, error: "City lookup is unavailable." },
      { status: 502 }
    );
  }

  const payload = (await response.json()) as { results?: GeoapifyResult[] };
  const suggestions = normalizeGeoapifyResults(payload.results || [], placeKey);
  lookupCache.set(cacheKey, suggestions);

  return Response.json({ suggestions, configured: true });
}

function buildLookupText(placeKey: string, query: string) {
  if (placeKey.startsWith("US-")) {
    const stateName = US_STATE_META[placeKey]?.name;
    return stateName ? `${query}, ${stateName}, United States` : `${query}, United States`;
  }

  return `${query}, ${countryName(placeKey)}`;
}

function normalizeGeoapifyResults(results: GeoapifyResult[], placeKey: string) {
  const seen = new Set<string>();
  const stateName = placeKey.startsWith("US-") ? US_STATE_META[placeKey]?.name : undefined;
  const stateCode = placeKey.replace("US-", "");

  return results
    .filter((result) => matchesPlace(result, placeKey, stateName, stateCode))
    .map((result) => {
      const name = result.city || result.name || result.formatted?.split(",")[0] || "";
      const lat = Number(result.lat);
      const lng = Number(result.lon);

      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      return {
        name,
        lat,
        lng,
        searchTerms: [normalizeSearchTerm(name)]
      };
    })
    .filter((result): result is CityOption => Boolean(result))
    .filter((result) => {
      const key = result.name.toLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function matchesPlace(
  result: GeoapifyResult,
  placeKey: string,
  stateName: string | undefined,
  stateCode: string
) {
  if (placeKey.startsWith("US-")) {
    const resultStateCode = result.state_code?.toUpperCase();
    const resultStateName = result.state?.toLowerCase();

    return (
      result.country_code?.toUpperCase() === "US" &&
      (resultStateCode === stateCode || resultStateName === stateName?.toLowerCase())
    );
  }

  return result.country_code?.toUpperCase() === placeKey;
}
