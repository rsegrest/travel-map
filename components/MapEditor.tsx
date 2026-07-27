"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Eye,
  Flag,
  Globe2,
  Lock,
  LogIn,
  LogOut,
  Map,
  PenLine,
  Plus,
  Save,
  Target,
  Trash2
} from "lucide-react";
import Link from "next/link";
import type { City, PlaceEntry, PlaceStatus, TravelMapData, TravelMapRecord } from "@/lib/schema";
import { PLACE_STATUSES } from "@/lib/schema";
import {
  CITY_OPTIONS_BY_PLACE,
  COUNTRY_OPTIONS,
  countryName,
  type CityOption,
  normalizeSearchTerm,
  type PlaceOption,
  STATE_OPTIONS,
  STATUS_COLORS,
  STATUS_LABELS,
  US_STATE_META
} from "@/lib/geo";
import { formatYears, parseYearInput } from "@/lib/years";
import { TravelMap } from "@/components/TravelMap";

type MapEditorProps = {
  initialMap: TravelMapRecord;
  slug: string;
  supabaseConfigured: boolean;
};

type Scope = "countries" | "states";
type EditorMode = "form" | "json" | "preview";

const emptyCity: City = {
  name: "",
  lat: 0,
  lng: 0,
  kind: "visited"
};

const emptyCityLookup = {
  placeKey: "",
  query: "",
  suggestions: [] as CityOption[],
  message: null as string | null
};

export function MapEditor({ initialMap, slug, supabaseConfigured }: MapEditorProps) {
  const [mapData, setMapData] = useState<TravelMapData>(initialMap.data);
  const [selectedScope, setSelectedScope] = useState<Scope>("countries");
  const [selectedKey, setSelectedKey] = useState<string>(
    Object.keys(initialMap.data.places.countries)[0] || ""
  );
  const [ownerKey, setOwnerKey] = useState("");
  const [email, setEmail] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("form");
  const [jsonDraft, setJsonDraft] = useState(JSON.stringify(initialMap.data, null, 2));
  const [placeQuery, setPlaceQuery] = useState("");
  const [newCity, setNewCity] = useState<City>(emptyCity);
  const [cityLookup, setCityLookup] = useState(emptyCityLookup);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ownerKeyStorageKey = `travel-map:${slug}:owner-key`;

  const supabase = useMemo(() => {
    if (!supabaseConfigured) {
      return null;
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, [supabaseConfigured]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token || null);
      setSignedInEmail(data.session?.user?.email || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token || null);
      setSignedInEmail(session?.user?.email || null);
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (supabaseConfigured) {
      return;
    }

    const restoreTimer = window.setTimeout(() => {
      const storedOwnerKey = window.localStorage.getItem(ownerKeyStorageKey);

      if (storedOwnerKey) {
        setOwnerKey((currentOwnerKey) => currentOwnerKey || storedOwnerKey);
      }
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [ownerKeyStorageKey, supabaseConfigured]);

  const places = mapData.places[selectedScope];
  const selectedPlace = selectedKey ? places[selectedKey] : undefined;
  const availableStatuses =
    selectedScope === "countries"
      ? PLACE_STATUSES.filter((status) => status !== "seen")
      : PLACE_STATUSES;
  const placeOptions = Object.entries(places).sort(([a, placeA], [b, placeB]) =>
    getPlaceName(selectedScope, a, placeA).localeCompare(getPlaceName(selectedScope, b, placeB))
  );
  const knownPlaceOptions = selectedScope === "countries" ? COUNTRY_OPTIONS : STATE_OPTIONS;
  const addSuggestions = getPlaceSuggestions(knownPlaceOptions, places, placeQuery);
  const localCitySuggestions = selectedPlace
    ? getCitySuggestions(selectedKey, selectedPlace.cities || [], newCity.name)
    : [];
  const cityLookupMatchesCurrentQuery =
    cityLookup.placeKey === selectedKey &&
    normalizeSearch(cityLookup.query) === normalizeSearch(newCity.name);
  const dynamicCitySuggestions = cityLookupMatchesCurrentQuery ? cityLookup.suggestions : [];
  const cityLookupMessage = cityLookupMatchesCurrentQuery ? cityLookup.message : null;
  const citySuggestions = mergeCitySuggestions(
    localCitySuggestions,
    dynamicCitySuggestions,
    selectedPlace?.cities || [],
    newCity.name
  );

  const canSave = supabaseConfigured ? Boolean(accessToken) : Boolean(ownerKey);

  useEffect(() => {
    const query = newCity.name.trim();

    if (!selectedKey || query.length < 3) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const params = new URLSearchParams({ q: query, placeKey: selectedKey });

      try {
        const response = await fetch(`/api/geocode/cities?${params.toString()}`, {
          signal: controller.signal
        });
        const body = (await response.json()) as {
          suggestions?: CityOption[];
          configured?: boolean;
          error?: string;
        };

        if (!response.ok || body.error) {
          setCityLookup({
            placeKey: selectedKey,
            query,
            suggestions: [],
            message: body.error || "City lookup is unavailable."
          });
          return;
        }

        setCityLookup({
          placeKey: selectedKey,
          query,
          suggestions: body.suggestions || [],
          message: body.configured ? null : "Dynamic city lookup is not configured."
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setCityLookup({
            placeKey: selectedKey,
            query,
            suggestions: [],
            message: "City lookup is unavailable."
          });
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [newCity.name, selectedKey]);

  async function sendMagicLink() {
    if (!supabase || !email) {
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/m/${slug}/edit`
      }
    });

    setMessage(error ? error.message : "Check your email for a sign-in link.");
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    setMessage(error ? error.message : "Signed out.");
  }

  function addPlace(option?: PlaceOption) {
    const selectedOption =
      option || resolvePlaceOption(knownPlaceOptions, places, placeQuery);

    if (!selectedOption) {
      setMessage(`Choose a known ${selectedScope === "countries" ? "country" : "state"} from the list.`);
      return;
    }

    const { code, name } = selectedOption;

    setMapData((current) => ({
      ...current,
      places: {
        ...current.places,
        [selectedScope]: {
          ...current.places[selectedScope],
          [code]: {
            name,
            status: "visited",
            years: [],
            cities: []
          }
        }
      }
    }));
    setSelectedKey(code);
    setPlaceQuery("");
    setMessage(`${name} added.`);
  }

  function updateSelectedPlace(next: PlaceEntry) {
    if (!selectedKey) {
      return;
    }

    setMapData((current) => ({
      ...current,
      places: {
        ...current.places,
        [selectedScope]: {
          ...current.places[selectedScope],
          [selectedKey]: next
        }
      }
    }));
  }

  function deleteSelectedPlace() {
    if (!selectedKey) {
      return;
    }

    setMapData((current) => {
      const nextPlaces = { ...current.places[selectedScope] };
      delete nextPlaces[selectedKey];
      const nextKey = Object.keys(nextPlaces)[0] || "";

      setSelectedKey(nextKey);

      return {
        ...current,
        places: {
          ...current.places,
          [selectedScope]: nextPlaces
        }
      };
    });
  }

  function applyJsonDraft() {
    try {
      const parsed = JSON.parse(jsonDraft) as TravelMapData;
      setMapData(parsed);
      setMessage("JSON applied. Save when ready.");
    } catch {
      setMessage("JSON is not valid.");
    }
  }

  async function saveMap() {
    setSaving(true);
    setMessage(null);

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    } else if (ownerKey) {
      headers["x-owner-key"] = ownerKey;
    }

    const response = await fetch(`/api/maps/${slug}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ data: mapData })
    });

    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      if (!supabaseConfigured && response.status === 401) {
        window.localStorage.removeItem(ownerKeyStorageKey);
      }

      setMessage(body.error || "Unable to save changes.");
      return;
    }

    if (!supabaseConfigured && ownerKey) {
      window.localStorage.setItem(ownerKeyStorageKey, ownerKey);
    }

    setMapData(body.data);
    setMessage("Saved.");
  }

  function forgetOwnerKey() {
    window.localStorage.removeItem(ownerKeyStorageKey);
    setOwnerKey("");
    setMessage("Owner key forgotten on this browser.");
  }

  return (
    <section className="editor-shell">
      <div className="editor-auth">
        <div className="auth-status">
          <Lock size={18} aria-hidden />
          <span>{canSave ? "Edit access active" : "Edit access required"}</span>
        </div>
        {supabaseConfigured ? (
          accessToken ? (
            <div className="auth-row">
              <span>Signed in{signedInEmail ? ` as ${signedInEmail}` : ""}</span>
              <button className="secondary-button compact-button" onClick={signOut} title="Sign out" type="button">
                <LogOut size={16} aria-hidden />
                Sign out
              </button>
            </div>
          ) : (
            <div className="auth-row">
              <input
                aria-label="Email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@example.com"
                type="email"
                value={email}
              />
              <button className="icon-button" onClick={sendMagicLink} title="Send sign-in link" type="button">
                <LogIn size={18} aria-hidden />
                Sign in
              </button>
            </div>
          )
        ) : (
          <div className="auth-row">
            <input
              aria-label="Owner key"
              onChange={(event) => setOwnerKey(event.target.value)}
              placeholder="demo-owner-key"
              type="password"
              value={ownerKey}
            />
            {ownerKey ? (
              <button className="secondary-button compact-button" onClick={forgetOwnerKey} type="button">
                Forget key
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="editor-tabs" role="tablist" aria-label="Editor views">
        <button className={mode === "form" ? "active" : ""} onClick={() => setMode("form")} type="button">
          <PenLine size={16} aria-hidden />
          Edit
        </button>
        <button
          className={mode === "json" ? "active" : ""}
          onClick={() => {
            setJsonDraft(JSON.stringify(mapData, null, 2));
            setMode("json");
          }}
          type="button"
        >
          <Map size={16} aria-hidden />
          JSON
        </button>
        <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")} type="button">
          <Eye size={16} aria-hidden />
          Preview
        </button>
      </div>

      {mode === "preview" ? (
        <TravelMap
          map={{
            ...initialMap,
            data: mapData,
            title: mapData.profile.title || initialMap.title
          }}
        />
      ) : null}

      {mode === "json" ? (
        <div className="json-editor">
          <textarea
            aria-label="Map JSON"
            onChange={(event) => setJsonDraft(event.target.value)}
            spellCheck={false}
            value={jsonDraft}
          />
          <div className="editor-actions">
            <button className="secondary-button" onClick={applyJsonDraft} type="button">
              Apply JSON
            </button>
            <SaveButton canSave={canSave} onSave={saveMap} saving={saving} />
          </div>
        </div>
      ) : null}

      {mode === "form" ? (
        <div className="editor-grid">
          <aside className="place-list-panel">
            <div className="segmented-control wide">
              <button
                className={selectedScope === "countries" ? "active" : ""}
                onClick={() => {
                  setSelectedScope("countries");
                  setSelectedKey(Object.keys(mapData.places.countries)[0] || "");
                }}
                type="button"
              >
                <Globe2 size={16} aria-hidden />
                Countries
              </button>
              <button
                className={selectedScope === "states" ? "active" : ""}
                onClick={() => {
                  setSelectedScope("states");
                  setSelectedKey(Object.keys(mapData.places.states)[0] || "");
                }}
                type="button"
              >
                <Map size={16} aria-hidden />
                States
              </button>
            </div>

            <div className="add-row">
              <div className="place-combobox">
                <input
                  aria-autocomplete="list"
                  aria-controls="place-suggestions"
                  aria-expanded={placeQuery.trim().length > 0}
                  aria-label={selectedScope === "countries" ? "Country" : "State"}
                  onChange={(event) => setPlaceQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addPlace();
                    }
                  }}
                  placeholder={
                    selectedScope === "countries"
                      ? "Search countries"
                      : "Search states"
                  }
                  role="combobox"
                  value={placeQuery}
                />
                {placeQuery.trim() ? (
                  <div className="combobox-list" id="place-suggestions" role="listbox">
                    {addSuggestions.length ? (
                      addSuggestions.map((option) => (
                        <button
                          className="combobox-option"
                          aria-selected={false}
                          key={option.code}
                          onClick={() => addPlace(option)}
                          role="option"
                          type="button"
                        >
                          <span>{option.name}</span>
                          <code>{option.code}</code>
                        </button>
                      ))
                    ) : (
                      <div className="combobox-empty">No available matches</div>
                    )}
                  </div>
                ) : null}
              </div>
              <button className="square-button" onClick={() => addPlace()} title="Add place" type="button">
                <Plus size={18} aria-hidden />
              </button>
            </div>

            <div className="place-list">
              {placeOptions.map(([key, place]) => (
                <button
                  className={selectedKey === key ? "place-row active" : "place-row"}
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  type="button"
                >
                  <span
                    className="status-dot"
                    style={{ background: STATUS_COLORS[place.status] }}
                    aria-hidden
                  />
                  <span>{getPlaceName(selectedScope, key, place)}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="place-form-panel">
            {selectedPlace ? (
              <PlaceForm
                availableStatuses={availableStatuses}
                cityLookupMessage={cityLookupMessage}
                citySuggestions={citySuggestions}
                displayName={getPlaceName(selectedScope, selectedKey, selectedPlace)}
                key={`${selectedScope}:${selectedKey}`}
                newCity={newCity}
                onAddCity={() => {
                  const cityToAdd = resolveCityForAdd(selectedKey, newCity, citySuggestions);
                  const normalizedCityToAdd =
                    selectedPlace.status === "lived" && cityToAdd.kind === "visited"
                      ? { ...cityToAdd, kind: "lived" as const }
                      : cityToAdd;

                  if (!normalizedCityToAdd.name.trim()) {
                    return;
                  }

                  if (!hasUsableCoordinates(normalizedCityToAdd)) {
                    setMessage("Choose a matching city suggestion or enter latitude and longitude.");
                    return;
                  }

                  if (
                    (selectedPlace.cities || []).some(
                      (city) => normalizeSearch(city.name) === normalizeSearch(normalizedCityToAdd.name)
                    )
                  ) {
                    setMessage(`${normalizedCityToAdd.name} is already listed.`);
                    return;
                  }

                  updateSelectedPlace({
                    ...selectedPlace,
                    cities: [...(selectedPlace.cities || []), normalizedCityToAdd]
                  });
                  setNewCity(emptyCity);
                }}
                onChange={updateSelectedPlace}
                onCityChange={setNewCity}
                onDelete={deleteSelectedPlace}
                onPickCity={(option) =>
                  setNewCity({
                    ...newCity,
                    name: option.name,
                    lat: option.lat,
                    lng: option.lng
                  })
                }
                place={selectedPlace}
              />
            ) : (
              <div className="empty-panel">Add or select a place.</div>
            )}
          </section>
        </div>
      ) : null}

      <div className="editor-actions persistent-actions">
        <Link className="secondary-button" href={`/m/${slug}`}>
          View public map
        </Link>
        <SaveButton canSave={canSave} onSave={saveMap} saving={saving} />
      </div>

      {message ? <p className="status-message">{message}</p> : null}
    </section>
  );
}

function PlaceForm({
  availableStatuses,
  place,
  newCity,
  citySuggestions,
  cityLookupMessage,
  displayName,
  onChange,
  onCityChange,
  onAddCity,
  onDelete,
  onPickCity
}: {
  availableStatuses: readonly PlaceStatus[];
  place: PlaceEntry;
  newCity: City;
  citySuggestions: CityOption[];
  cityLookupMessage: string | null;
  displayName: string;
  onChange: (place: PlaceEntry) => void;
  onCityChange: (city: City) => void;
  onAddCity: () => void;
  onDelete: () => void;
  onPickCity: (city: CityOption) => void;
}) {
  const [yearsDraft, setYearsDraft] = useState(() => formatYears(place.years));

  return (
    <div className="place-form">
      <div className="form-header">
        <div className="place-name-display">
          <p className="eyebrow">Name</p>
          <p className="place-name-static">{displayName}</p>
        </div>
        <button className="danger-button" onClick={onDelete} title="Delete place" type="button">
          <Trash2 size={17} aria-hidden />
          Delete
        </button>
      </div>

      <div className="status-picker" aria-label="Status">
        {availableStatuses.map((status) => (
          <button
            className={place.status === status ? "active" : ""}
            key={status}
            onClick={() => onChange({ ...place, status })}
            type="button"
          >
            <span className="status-dot" style={{ background: STATUS_COLORS[status] }} aria-hidden />
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      <label>
        Years
        <input
          onBlur={() => setYearsDraft(formatYears(place.years))}
          onChange={(event) => {
            const nextYearsDraft = event.target.value;
            setYearsDraft(nextYearsDraft);
            onChange({
              ...place,
              years: parseYearInput(nextYearsDraft)
            });
          }}
          placeholder="1995-1996, 2001, 2004-2006"
          value={yearsDraft}
        />
      </label>

      <div className="city-editor">
        <h3>Cities</h3>
        <div className="city-list editable">
          {(place.cities || []).map((city, index) => (
            <div className="city-row" key={`${city.name}-${index}`}>
              {city.kind === "want" ? <Target size={15} aria-hidden /> : <Flag size={15} aria-hidden />}
              <span>{city.name}</span>
              <button
                className="ghost-icon"
                onClick={() =>
                  onChange({
                    ...place,
                    cities: (place.cities || []).filter((_, cityIndex) => cityIndex !== index)
                  })
                }
                title="Remove city"
                type="button"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <div className="city-add-grid">
          <div className="place-combobox">
            <input
              aria-autocomplete="list"
              aria-controls="city-suggestions"
              aria-expanded={newCity.name.trim().length > 0}
              aria-label="City name"
              onChange={(event) => onCityChange({ ...newCity, name: event.target.value })}
              placeholder="City"
              role="combobox"
              value={newCity.name}
            />
            {newCity.name.trim() ? (
              <div className="combobox-list" id="city-suggestions" role="listbox">
                {citySuggestions.length ? (
                  citySuggestions.map((option) => (
                    <button
                      aria-selected={false}
                      className="combobox-option"
                      key={`${option.name}-${option.lat}-${option.lng}`}
                      onClick={() => onPickCity(option)}
                      role="option"
                      type="button"
                    >
                      <span>{option.name}</span>
                      <code>
                        {option.lat.toFixed(2)}, {option.lng.toFixed(2)}
                      </code>
                    </button>
                  ))
                ) : (
                  <div className="combobox-empty">
                    {cityLookupMessage || "No coordinate match"}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <input
            aria-label="Latitude"
            onChange={(event) =>
              onCityChange({ ...newCity, lat: Number.parseFloat(event.target.value) || 0 })
            }
            placeholder="Latitude"
            type="number"
            value={String(newCity.lat)}
          />
          <input
            aria-label="Longitude"
            onChange={(event) =>
              onCityChange({ ...newCity, lng: Number.parseFloat(event.target.value) || 0 })
            }
            placeholder="Longitude"
            type="number"
            value={String(newCity.lng)}
          />
          <select
            aria-label="City marker"
            onChange={(event) => onCityChange({ ...newCity, kind: event.target.value as City["kind"] })}
            value={newCity.kind}
          >
            <option value="visited">Flag - visited</option>
            <option value="lived">Flag - lived</option>
            <option value="want">Target - want to go</option>
          </select>
          <button className="icon-button" onClick={onAddCity} type="button">
            <Plus size={17} aria-hidden />
            Add city
          </button>
        </div>
      </div>

      <div className="post-editor">
        <h3>Post</h3>
        <input
          aria-label="Post title"
          onChange={(event) =>
            onChange({
              ...place,
              post: { ...place.post, title: event.target.value }
            })
          }
          placeholder="Title"
          value={place.post?.title || ""}
        />
        <textarea
          aria-label="Post body"
          onChange={(event) =>
            onChange({
              ...place,
              post: { ...place.post, body: event.target.value }
            })
          }
          placeholder="Impressions"
          value={place.post?.body || ""}
        />
      </div>
    </div>
  );
}

function SaveButton({
  canSave,
  saving,
  onSave
}: {
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <button className="primary-button" disabled={!canSave || saving} onClick={onSave} type="button">
      <Save size={17} aria-hidden />
      {saving ? "Saving" : "Save"}
    </button>
  );
}

function getPlaceName(scope: Scope, key: string, place: PlaceEntry) {
  if (place.name) {
    return place.name;
  }

  return scope === "countries" ? countryName(key) : US_STATE_META[key]?.name || key;
}

const MAX_SUGGESTIONS = 50;

function getPlaceSuggestions(
  options: PlaceOption[],
  places: Record<string, PlaceEntry>,
  query: string
) {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return [];
  }

  return options
    .filter((option) => !places[option.code] && matchesPrefix(option.searchTerms, normalizedQuery))
    .slice(0, MAX_SUGGESTIONS);
}

function resolvePlaceOption(
  options: PlaceOption[],
  places: Record<string, PlaceEntry>,
  query: string
) {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return undefined;
  }

  return options.find(
    (option) => !places[option.code] && option.searchTerms.includes(normalizedQuery)
  );
}

function normalizeSearch(value: string) {
  return normalizeSearchTerm(value);
}

function matchesPrefix(searchTerms: string[], normalizedQuery: string) {
  return searchTerms.some((term) => term.startsWith(normalizedQuery));
}

function getCitySuggestions(placeKey: string, existingCities: City[], query: string) {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return [];
  }

  const existingNames = new Set(existingCities.map((city) => normalizeSearch(city.name)));

  return (CITY_OPTIONS_BY_PLACE[placeKey] || [])
    .filter(
      (option) =>
        !existingNames.has(normalizeSearch(option.name)) &&
        matchesPrefix(option.searchTerms, normalizedQuery)
    )
    .slice(0, MAX_SUGGESTIONS);
}

function mergeCitySuggestions(
  localSuggestions: CityOption[],
  dynamicSuggestions: CityOption[],
  existingCities: City[],
  query: string
) {
  const normalizedQuery = normalizeSearch(query);
  const existingNames = new Set(existingCities.map((city) => normalizeSearch(city.name)));
  const seen = new Set<string>();

  return [...localSuggestions, ...dynamicSuggestions]
    .filter((option) => matchesPrefix(option.searchTerms, normalizedQuery))
    .filter((option) => !existingNames.has(normalizeSearch(option.name)))
    .filter((option) => {
      const key = normalizeSearch(option.name);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, MAX_SUGGESTIONS);
}

function resolveCityForAdd(placeKey: string, city: City, suggestions: CityOption[]): City {
  if (hasUsableCoordinates(city)) {
    return city;
  }

  const matchedCity =
    suggestions.find((option) => normalizeSearch(option.name) === normalizeSearch(city.name)) ||
    (CITY_OPTIONS_BY_PLACE[placeKey] || []).find(
      (option) => normalizeSearch(option.name) === normalizeSearch(city.name)
    );

  if (!matchedCity) {
    return city;
  }

  return {
    ...city,
    name: matchedCity.name,
    lat: matchedCity.lat,
    lng: matchedCity.lng
  };
}

function hasUsableCoordinates(city: City) {
  return (
    Number.isFinite(city.lat) &&
    Number.isFinite(city.lng) &&
    city.lat >= -90 &&
    city.lat <= 90 &&
    city.lng >= -180 &&
    city.lng <= 180 &&
    !(city.lat === 0 && city.lng === 0)
  );
}
