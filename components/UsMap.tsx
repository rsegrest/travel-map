"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import usAtlas from "us-atlas/states-10m.json";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { Search } from "lucide-react";
import { PLACE_STATUSES, type PlaceEntry, type PlaceStatus, type TravelMapRecord } from "@/lib/schema";
import {
  countryName,
  flagEmoji,
  STATUS_COLORS,
  STATUS_LABELS,
  US_STATE_META,
  STATE_BY_FIPS,
} from "@/lib/geo";
import { formatYears } from "@/lib/years";

type RegionSelection = {
  key: string;
  label: string;
  place?: PlaceEntry;
};

type StatusListEntry = {
  key: string;
  label: string;
  place: PlaceEntry;
};

const WIDTH = 1100;
const HEIGHT = 600;

export function UsMap({
  map,
  selected,
  onSelect,
}: {
  map: TravelMapRecord;
  selected: RegionSelection | null;
  onSelect: (sel: RegionSelection) => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const usFeatures = useMemo(() => {
    const topology = usAtlas as any;
    const collection = feature(topology, topology.objects.states) as unknown as FeatureCollection<Geometry>;
    return collection.features;
  }, []);

  const stateByFips = useMemo(() => {
    return Object.fromEntries(
      Object.keys(map.data.places.states)
        .map((code) => [US_STATE_META[code]?.fips, code])
        .filter(([fips]) => Boolean(fips))
    );
  }, [map.data.places.states]);

  const projection = useMemo(() => {
    return geoAlbersUsa().fitSize([WIDTH, HEIGHT], {
      type: "FeatureCollection",
      features: usFeatures,
    });
  }, [usFeatures]);

  const path = useMemo(() => geoPath(projection), [projection]);

  function getStateInfo(region: Feature<Geometry>): RegionSelection {
    const id = String(region.id ?? "").padStart(2, "0");
    const key = stateByFips[id] || STATE_BY_FIPS[id]?.code || id;
    const place = map.data.places.states[key];
    const label = place?.name || STATE_BY_FIPS[id]?.name || key;
    return { key, label, place };
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ width: "100%", height: "100%" }}
      role="img"
    >
      <style>{`.us-state:focus-visible { outline: none; }`}</style>
      <title>United States travel map</title>
      <rect width={WIDTH} height={HEIGHT} fill="#0a1628" />
      {usFeatures.map((region, index) => {
        const info = getStateInfo(region);
        const isSelected = selected?.key === info.key;
        const fill = info.place
          ? STATUS_COLORS[info.place.status]
          : "#0d2818";
        const stroke =
          isSelected || info.place?.status === "lived"
            ? "rgba(34, 211, 238, 0.9)"
            : "rgba(255, 255, 255, 0.25)";
        const opacity = info.place ? 0.5 : 0.7;

        return (
          <path
            key={`us-${region.id}-${index}`}
            className="us-state"
            aria-label={info.label}
            d={path(region) || undefined}
            fill={fill}
            fillOpacity={opacity}
            stroke={stroke}
            strokeWidth={isSelected ? 2 : 0.5}
            onClick={() => onSelect(info)}
            onPointerEnter={() => setHoveredKey(info.key)}
            onPointerLeave={() => setHoveredKey((c) => (c === info.key ? null : c))}
            style={{ cursor: "pointer", transition: "fill 0.2s, stroke 0.2s", outline: "none" }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(info); }}
          />
        );
      })}
    </svg>
  );
}
