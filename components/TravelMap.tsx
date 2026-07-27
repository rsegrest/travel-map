"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-50m.json";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { Search } from "lucide-react";
import { PLACE_STATUSES, type PlaceEntry, type PlaceStatus, type TravelMapRecord } from "@/lib/schema";
import {
  countryCodeFromTopoId,
  countryName,
  flagEmoji,
  STATUS_COLORS,
  STATUS_LABELS,
  US_STATE_META,
} from "@/lib/geo";
import { formatYears } from "@/lib/years";
import { UsMap } from "./UsMap";

// Dynamically import Globe to avoid SSR window access
const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

type MapScope = "world" | "us";

type TravelMapProps = {
  map: TravelMapRecord;
};

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

export function TravelMap({ map }: TravelMapProps) {
  const [scope, setScope] = useState<MapScope>("world");
  const [selected, setSelected] = useState<RegionSelection | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<PlaceStatus | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const globeRef = useRef<any>(null);
  const mapCanvasWrapRef = useRef<HTMLDivElement>(null);
  const [globeDimensions, setGlobeDimensions] = useState({ width: WIDTH, height: HEIGHT });

  // Keep the globe canvas sized to its wrapper, which is responsive via CSS
  useEffect(() => {
    const wrapEl = mapCanvasWrapRef.current;
    if (!wrapEl) return;
    const updateGlobeDimensions = () => {
      setGlobeDimensions({ width: wrapEl.clientWidth, height: wrapEl.clientHeight });
    };
    updateGlobeDimensions();
    const resizeObserver = new ResizeObserver(updateGlobeDimensions);
    resizeObserver.observe(wrapEl);
    return () => resizeObserver.disconnect();
  }, []);

  // Build world features with ISO codes as properties
  const worldFeatures = useMemo(() => {
    const topology = worldAtlas as any;
    const collection = feature(topology, topology.objects.countries) as unknown as FeatureCollection<Geometry>;
    // Add ISO_A2 property to each feature for Globe.gl
    collection.features.forEach((f) => {
      const id = String(f.id ?? "").padStart(3, "0");
      const code = countryCodeFromTopoId(id) || id;
      (f.properties ??= {}).ISO_A2 = code;
    });
    return collection.features;
  }, []);

  // Build a lookup from ISO code to place entry
  const worldByCode = useMemo(() => {
    return map.data.places.countries;
  }, [map.data.places.countries]);

  // Build a lookup from topo ID to ISO code (only exact matches)
  const worldByTopoId = useMemo(() => {
    return Object.fromEntries(
      Object.keys(map.data.places.countries).map((code) => {
        const numeric = require("i18n-iso-countries").alpha2ToNumeric(code.toUpperCase());
        return [numeric ? numeric.padStart(3, "0") : code, code];
      })
    );
  }, [map.data.places.countries]);

  const visibleStatuses: readonly PlaceStatus[] =
    scope === "world" ? PLACE_STATUSES.filter((status) => status !== "seen") : PLACE_STATUSES;

  // Current collection based on scope
  const currentCollection = scope === "world" ? map.data.places.countries : map.data.places.states;

  // Search options
  const searchOptions = useMemo(() => {
    const results: { key: string; label: string }[] = [];
    for (const [code, place] of Object.entries(currentCollection)) {
      const label = place.name || (scope === "world" ? countryName(code) : US_STATE_META[code]?.name || code);
      const q = searchQuery.toLowerCase().trim();
      if (!q || label.toLowerCase().includes(q) || code.toLowerCase().includes(q)) {
        results.push({ key: code, label });
      }
    }
    return results.sort((a, b) => a.label.localeCompare(b.label));
  }, [searchQuery, currentCollection, scope]);

  function selectPlaceFromSearch(option: { key: string; label: string }) {
    setSearchQuery("");
    setSearchFocused(false);
    const place = currentCollection[option.key];
    setSelected({ key: option.key, label: option.label, place });
    // Point the globe at this country
    if (scope === "world" && globeRef.current) {
      const feature = worldFeatures.find((f) => (f.properties?.ISO_A2) === option.key);
      if (feature) {
        const centroid = getCentroid(feature);
        if (centroid) {
          globeRef.current.pointOfView({ lat: centroid[1], lng: centroid[0], altitude: 1.5 }, 800);
        }
      }
    }
  }

  function getCentroid(feature: Feature<Geometry>): [number, number] | null {
    // Simple centroid from geometry coordinates
    const geo = feature.geometry;
    if (!geo) return null;
    if (geo.type === "Polygon") {
      const coords = (geo.coordinates as any)[0];
      if (!coords?.length) return null;
      let sumLng = 0, sumLat = 0, count = 0;
      for (const c of coords) {
        sumLng += c[0];
        sumLat += c[1];
        count++;
      }
      return [sumLng / count, sumLat / count];
    }
    if (geo.type === "MultiPolygon") {
      const polys = geo.coordinates as any;
      let sumLng = 0, sumLat = 0, count = 0;
      for (const poly of polys) {
        for (const ring of poly) {
          for (const c of ring) {
            sumLng += c[0];
            sumLat += c[1];
            count++;
          }
        }
      }
      return count > 0 ? [sumLng / count, sumLat / count] : null;
    }
    return null;
  }

  function toggleStatusFilter(status: PlaceStatus) {
    setSelectedStatus((current) => (current === status ? null : status));
    setSelected(null);
  }

  function selectPlaceFromStatus(entry: StatusListEntry) {
    setSelectedStatus(null);
    setSelected({ key: entry.key, label: entry.label, place: entry.place });
  }

  // Polygon color function — toned down for the globe
  const polygonCapColor = useCallback(
    (d: any) => {
      const code = d.properties?.ISO_A2;
      if (!code) return "rgba(26, 26, 46, 0.6)";
      const place = worldByCode[code];
      if (!place) return "rgba(26, 26, 46, 0.6)";
      // Muted versions of status colors at lower opacity
      const muted: Record<string, string> = {
        visited: "rgba(34, 211, 238, 0.25)",
        seen: "rgba(168, 85, 247, 0.25)",
        planned: "rgba(74, 222, 128, 0.2)",
        want: "rgba(251, 191, 36, 0.2)",
        lived: "rgba(244, 114, 182, 0.2)",
      };
      return muted[place.status] || "rgba(26, 26, 46, 0.6)";
    },
    [worldByCode]
  );

  const polygonSideColor = useCallback(() => "rgba(34, 211, 238, 0.08)", []);
  const polygonStrokeColor = useCallback(
    (d: any) => {
      const code = d.properties?.ISO_A2;
      if (!code) return "rgba(255,255,255,0.2)";
      const place = worldByCode[code];
      if (!place) return "rgba(255,255,255,0.2)";
      return "rgba(34, 211, 238, 0.5)";
    },
    [worldByCode]
  );

  const polygonAltitude = useCallback(
    (d: any) => {
      const code = d.properties?.ISO_A2;
      if (!code) return 0.005;
      const place = worldByCode[code];
      if (!place) return 0.005;
      return selected?.key === code ? 0.04 : 0.02;
    },
    [worldByCode, selected]
  );

  const onPolygonClick = useCallback(
    (polygon: any, event: any, { lat, lng }: { lat: number; lng: number }) => {
      const code = polygon.properties?.ISO_A2;
      if (!code) return;
      const place = worldByCode[code];
      const label = place?.name || countryName(code);
      setSelected({ key: code, label, place });
    },
    [worldByCode]
  );

  // City markers
  const cityMarkers = useMemo(() => {
    const markers: { lat: number; lng: number; name: string; kind: string; placeKey: string }[] = [];
    for (const [code, place] of Object.entries(worldByCode)) {
      if (place.cities) {
        for (const city of place.cities) {
          markers.push({ ...city, placeKey: code });
        }
      }
    }
    return markers;
  }, [worldByCode]);

  // Visited places list
  const visitedPlaces = useMemo(
    () =>
      Object.entries(currentCollection)
        .filter(([, place]) => place.status === "visited")
        .sort(([codeA], [codeB]) => {
          const nameA = currentCollection[codeA]?.name || (scope === "world" ? countryName(codeA) : US_STATE_META[codeA]?.name || codeA);
          const nameB = currentCollection[codeB]?.name || (scope === "world" ? countryName(codeB) : US_STATE_META[codeB]?.name || codeB);
          return nameA.localeCompare(nameB);
        }),
    [currentCollection, scope]
  );

  function countStatus(status: PlaceStatus) {
    return Object.values(currentCollection).filter((place) => place.status === status).length;
  }

  function getPlacesByStatus(status: PlaceStatus): StatusListEntry[] {
    return Object.entries(currentCollection)
      .filter(([, place]) => place.status === status)
      .map(([key, place]) => ({
        key,
        label: place.name || (scope === "world" ? countryName(key) : US_STATE_META[key]?.name || key),
        place,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return (
    <section className="map-layout">
      <div className="map-panel">
        <div className="map-toolbar" aria-label="Map controls">
          {/* Search */}
          <div className="search-wrap" style={{ position: "relative", flex: 1, maxWidth: 280 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              placeholder={scope === "world" ? "Search countries…" : "Search states…"}
              style={{
                width: "100%",
                height: 36,
                padding: "0 10px 0 32px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface-strong)",
                color: "var(--text)",
                fontSize: 13,
                outline: "none",
              }}
            />
            {searchFocused && searchQuery.trim() && searchOptions.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  maxHeight: 260,
                  overflow: "auto",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  boxShadow: "var(--shadow)",
                  zIndex: 20,
                  backdropFilter: "blur(12px)",
                }}
              >
                {searchOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectPlaceFromSearch(opt); }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      border: "none",
                      background: "transparent",
                      color: "var(--text)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-strong)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="segmented-control">
            <button
              className={scope === "world" ? "active" : ""}
              type="button"
              onClick={() => { setScope("world"); setSelected(null); setSelectedStatus(null); }}
            >
              World
            </button>
            <button
              className={scope === "us" ? "active" : ""}
              type="button"
              onClick={() => { setScope("us"); setSelected(null); setSelectedStatus(null); }}
            >
              United States
            </button>
          </div>
          <div className="legend" aria-label="Map legend">
            {visibleStatuses.map((status) => (
              <span className="legend-item" key={status}>
                <span
                  className="legend-swatch"
                  style={{ background: STATUS_COLORS[status] }}
                />
                {STATUS_LABELS[status]}
              </span>
            ))}
          </div>
        </div>

        <div className="map-canvas-wrap" ref={mapCanvasWrapRef}>
          {scope === "world" ? (
            <Globe
              ref={globeRef}
              width={globeDimensions.width}
              height={globeDimensions.height}
              globeImageUrl="https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg"
              backgroundImageUrl="https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png"
              polygonsData={worldFeatures.filter((d) => d.properties?.ISO_A2 && d.properties.ISO_A2 !== "AQ")}
              polygonCapColor={polygonCapColor}
              polygonSideColor={polygonSideColor}
              polygonStrokeColor={polygonStrokeColor}
              polygonAltitude={polygonAltitude}
              onPolygonClick={onPolygonClick}
              polygonsTransitionDuration={300}
              pointsData={cityMarkers}
              pointLat="lat"
              pointLng="lng"
              pointAltitude={0.05}
              pointRadius={0.25}
              pointColor={() => "#22d3ee"}
              atmosphereColor="#22d3ee"
              atmosphereAltitude={0.15}
            />
          ) : (
            <UsMap map={map} selected={selected} onSelect={(sel) => setSelected(sel)} />
          )}
        </div>

        <div
          aria-label="Visited countries"
          className="visited-strip"
        >
          {visitedPlaces.length ? (
            visitedPlaces.map(([code, place]) => {
              const label = place.name || (scope === "world" ? countryName(code) : US_STATE_META[code]?.name || code);
              const isActive = selected?.key === code;
              return (
                <button
                  className={`flag-pill${isActive ? " active" : ""}`}
                  key={code}
                  onClick={() => setSelected({ key: code, label, place })}
                  type="button"
                >
                  {scope === "world" ? <span aria-hidden>{flagEmoji(code)}</span> : null}
                  {label}
                </button>
              );
            })
          ) : (
            <span className="muted">
              No visited countries yet.
            </span>
          )}
        </div>
      </div>

      <aside className="detail-panel">
        <div className="stat-grid">
          {visibleStatuses.map((status) => {
            const isActive = selectedStatus === status;
            return (
              <button
                aria-pressed={isActive}
                className={`stat-card${isActive ? " active" : ""}`}
                key={status}
                onClick={() => toggleStatusFilter(status)}
                type="button"
              >
                <span>{STATUS_LABELS[status]}</span>
                <strong>{countStatus(status)}</strong>
              </button>
            );
          })}
        </div>

        <div className="place-detail">
          {selected ? (
            <>
              <p className="eyebrow">Selected place</p>
              <h2>{selected.place?.name || selected.label}</h2>
              {selected.place ? (
                <>
                  <p className="status-line">
                    <span
                      className="legend-swatch"
                      style={{ background: STATUS_COLORS[selected.place.status] }}
                    />
                    {STATUS_LABELS[selected.place.status]}
                  </p>
                  {selected.place.years?.length ? (
                    <p className="muted">Years: {formatYears(selected.place.years)}</p>
                  ) : null}
                  {selected.place.cities?.length ? (
                    <ul className="city-list">
                      {selected.place.cities.map((city) => (
                        <li key={`${city.name}-${city.kind}`}>
                          <span className={`city-icon ${city.kind}`} aria-hidden />
                          {city.name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {selected.place.post?.title || selected.place.post?.body ? (
                    <article className="post-preview">
                      {selected.place.post.title ? <h3>{selected.place.post.title}</h3> : null}
                      {selected.place.post.body ? <p>{selected.place.post.body}</p> : null}
                    </article>
                  ) : null}
                  {selected.place.blogPostSlug ? (
                    <div className="post-preview">
                      <h3>Related Blog Post</h3>
                      <p>
                        <a
                          href={`${process.env.NEXT_PUBLIC_BLOG_BASE_URL ?? ""}/blog/${selected.place.blogPostSlug}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Read more about {selected.place.name || selected.label} →
                        </a>
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="muted">Unmarked</p>
              )}
            </>
          ) : selectedStatus ? (
            <StatusList
              entries={getPlacesByStatus(selectedStatus)}
              onPick={selectPlaceFromStatus}
              scope={scope}
              status={selectedStatus}
            />
          ) : (
            <>
              <p className="eyebrow">Selected place</p>
              <h2>Choose a region</h2>
              <p className="muted">Marked regions show their years, notes, and cities here. Click a stat tile to list places by status.</p>
            </>
          )}
        </div>
      </aside>
    </section>
  );
}

function StatusList({
  entries,
  onPick,
  scope,
  status,
}: {
  entries: StatusListEntry[];
  onPick: (entry: StatusListEntry) => void;
  scope: MapScope;
  status: PlaceStatus;
}) {
  const singularNoun = scope === "world" ? "country" : "state";
  const pluralNoun = scope === "world" ? "countries" : "states";
  const noun = entries.length === 1 ? singularNoun : pluralNoun;

  return (
    <>
      <p className="eyebrow">{STATUS_LABELS[status]}</p>
      <h2>
        {entries.length} {noun}
      </h2>
      {entries.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="status-list">
          {entries.map((entry) => (
            <li key={entry.key}>
              <button
                className="status-list-item"
                onClick={() => onPick(entry)}
                type="button"
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
