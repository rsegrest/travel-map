"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { TravelMapRecord, PlaceEntry, PlaceStatus, City } from "@/lib/schema";
import { countryName, flagEmoji, STATUS_COLORS, STATUS_LABELS, US_STATE_META, COUNTRY_OPTIONS, STATE_OPTIONS } from "@/lib/geo";

const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function AdminClient() {
  const { slug } = useParams<{ slug: string }>();
  const [ownerKey, setOwnerKey] = useState("");
  const [email, setEmail] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [map, setMap] = useState<TravelMapRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState<"countries" | "states">("countries");
  const [editCode, setEditCode] = useState("");
  const [editPlace, setEditPlace] = useState<PlaceEntry | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newNameSearch, setNewNameSearch] = useState("");
  const [newNameFocused, setNewNameFocused] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownerKeyStorageKey = `travel-map:${slug}:owner-key`;

  const supabase = useMemo(() => {
    if (!supabaseConfigured) {
      return null;
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

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
        setOwnerKey((current) => current || storedOwnerKey);
      }
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [ownerKeyStorageKey]);

  const canSave = supabaseConfigured ? Boolean(accessToken) : Boolean(ownerKey);

  function authHeaders(): Record<string, string> {
    if (accessToken) {
      return { Authorization: `Bearer ${accessToken}` };
    }
    if (ownerKey) {
      return { "x-owner-key": ownerKey };
    }
    return {};
  }

  async function sendMagicLink() {
    if (!supabase || !email) {
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/m/${slug}/admin`
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

  function rememberOwnerKey(key: string) {
    setOwnerKey(key);
    if (key) {
      window.localStorage.setItem(ownerKeyStorageKey, key);
    } else {
      window.localStorage.removeItem(ownerKeyStorageKey);
    }
  }

  // Searchable options for adding new places
  const allOptions = useMemo(
    () => (scope === "countries" ? COUNTRY_OPTIONS : STATE_OPTIONS),
    [scope]
  );

  const filteredOptions = useMemo(() => {
    const q = newNameSearch.toLowerCase().trim();
    if (!q) return [];
    return allOptions
      .filter((opt) =>
        opt.searchTerms.some((t) => t.includes(q)) ||
        opt.name.toLowerCase().includes(q) ||
        opt.code.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [newNameSearch, allOptions]);

  // Load map data — public read, no auth required
  useEffect(() => {
    fetch(`/api/maps/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        setMap(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  // Auto-save: debounce 500ms after editPlace changes
  useEffect(() => {
    if (!map || !editPlace || !editCode || !canSave) return;
    const coll = map.data?.places?.[scope] || {};
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const updated = {
        ...map.data,
        places: {
          ...map.data.places,
          [scope]: {
            ...coll,
            [editCode]: editPlace,
          },
        },
      };
      fetch(`/api/maps/${slug}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ data: updated }),
      })
        .then((r) => r.json())
        .then((result) => {
          setMap(result);
        })
        .catch(() => {});
    }, 500);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [editPlace, editCode, scope, slug, canSave, map?.data?.places?.[scope]]);

  const collection = map?.data?.places?.[scope] || {};
  const sortedEntries = Object.entries(collection).sort(([a], [b]) => a.localeCompare(b));

  function startEdit(code: string, place: PlaceEntry) {
    setEditCode(code);
    setEditPlace({ ...place, years: [...(place.years || [])], cities: [...(place.cities || [])] });
  }

  function addNew() {
    const code = newCode.trim().toUpperCase();
    if (!code) return;
    const fullCode = scope === "states" && !code.startsWith("US-") ? `US-${code}` : code;
    startEdit(fullCode, { status: "visited", years: [], cities: [] });
    setNewCode("");
  }

  function updateField(field: keyof PlaceEntry, value: any) {
    setEditPlace((prev) => (prev ? { ...prev, [field]: value } : null));
  }

  function addYear(year: number) {
    setEditPlace((prev) => {
      if (!prev) return prev;
      const years = [...(prev.years || [])];
      if (!years.includes(year)) {
        years.push(year);
        years.sort((a, b) => a - b);
      }
      return { ...prev, years };
    });
  }

  function removeYear(year: number) {
    setEditPlace((prev) => {
      if (!prev) return prev;
      return { ...prev, years: (prev.years || []).filter((y) => y !== year) };
    });
  }

  function addCity() {
    setEditPlace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cities: [...(prev.cities || []), { name: "", lat: 0, lng: 0, kind: "visited" as const }],
      };
    });
  }

  function updateCity(index: number, field: keyof City, value: any) {
    setEditPlace((prev) => {
      if (!prev) return prev;
      const cities = [...(prev.cities || [])];
      cities[index] = { ...cities[index], [field]: value };
      return { ...prev, cities };
    });
  }

  function removeCity(index: number) {
    setEditPlace((prev) => {
      if (!prev) return prev;
      return { ...prev, cities: (prev.cities || []).filter((_, i) => i !== index) };
    });
  }

  async function savePlace() {
    if (!map || !editPlace || !editCode || !canSave) return;
    setSaving(true);
    setMessage("");

    const updated = {
      ...map.data,
      places: {
        ...map.data.places,
        [scope]: {
          ...collection,
          [editCode]: editPlace,
        },
      },
    };

    const res = await fetch(`/api/maps/${slug}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ data: updated }),
    });

    if (res.ok) {
      const result = await res.json();
      setMap(result);
      setMessage("Saved!");
      setTimeout(() => setMessage(""), 2000);
    } else {
      const err = await res.json();
      setMessage(`Error: ${err.error}`);
    }
    setSaving(false);
  }

  async function deletePlace(code: string) {
    if (!map || !canSave || !confirm(`Remove ${code}?`)) return;
    setSaving(true);

    const { [code]: _, ...rest } = collection;
    const updated = {
      ...map.data,
      places: {
        ...map.data.places,
        [scope]: rest,
      },
    };

    const res = await fetch(`/api/maps/${slug}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ data: updated }),
    });

    if (res.ok) {
      const result = await res.json();
      setMap(result);
      setEditCode("");
      setEditPlace(null);
    }
    setSaving(false);
  }

  if (loading) return <div className="admin-loading">Loading...</div>;
  if (!map) return <div className="admin-loading">Map not found</div>;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <h1>Travel Map Admin</h1>
        <p className="muted">{slug} — {Object.keys(collection).length} {scope}</p>
        <div className="admin-auth">
          {supabaseConfigured ? (
            accessToken ? (
              <span className="muted">Signed in{signedInEmail ? ` as ${signedInEmail}` : ""} · <button className="admin-link-btn" onClick={signOut} type="button">Sign out</button></span>
            ) : (
              <>
                <input
                  type="email"
                  placeholder="owner@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="admin-auth-input"
                />
                <button className="admin-link-btn" onClick={sendMagicLink} type="button">Sign in</button>
              </>
            )
          ) : (
            <input
              type="password"
              placeholder="Owner key"
              value={ownerKey}
              onChange={(e) => rememberOwnerKey(e.target.value)}
              className="admin-auth-input"
            />
          )}
        </div>
        {message && <span className="admin-toast">{message}</span>}
      </header>

      <div className="admin-layout">
        {/* Sidebar: place list */}
        <aside className="admin-sidebar">
          <div className="admin-tabs">
            <button
              className={scope === "countries" ? "active" : ""}
              onClick={() => { setScope("countries"); setEditCode(""); setEditPlace(null); }}
            >
              Countries
            </button>
            <button
              className={scope === "states" ? "active" : ""}
              onClick={() => { setScope("states"); setEditCode(""); setEditPlace(null); }}
            >
              States
            </button>
          </div>

          <div className="admin-add" style={{ position: "relative" }}>
            <input
              type="text"
              placeholder={scope === "countries" ? "Search for a country..." : "Search for a state..."}
              value={newNameSearch}
              onChange={(e) => setNewNameSearch(e.target.value)}
              onFocus={() => setNewNameFocused(true)}
              onBlur={() => setTimeout(() => setNewNameFocused(false), 200)}
            />
            {newNameFocused && filteredOptions.length > 0 && (
              <div className="admin-add-dropdown">
                {filteredOptions.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const code = scope === "states" && !opt.code.startsWith("US-") ? `US-${opt.code}` : opt.code;
                      startEdit(code, { status: "visited", years: [], cities: [] });
                      setNewNameSearch("");
                      setNewNameFocused(false);
                    }}
                  >
                    {scope === "countries" ? flagEmoji(opt.code) : null}
                    {opt.name}
                    <span className="admin-add-code">{opt.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="admin-list">
            {sortedEntries.map(([code, place]) => (
              <button
                key={code}
                className={`admin-item ${editCode === code ? "active" : ""}`}
                onClick={() => startEdit(code, place)}
              >
                <span className="admin-item-flag">{scope === "countries" ? flagEmoji(code) : null}</span>
                <span className="admin-item-name">{place.name || (scope === "countries" ? countryName(code) : US_STATE_META[code]?.name || code)}</span>
                <span className="admin-item-status" style={{ background: STATUS_COLORS[place.status] }} />
              </button>
            ))}
          </div>
        </aside>

        {/* Main: editor */}
        <main className="admin-editor">
          {editPlace ? (
            <div className="admin-form">
              <div className="admin-form-row">
                <label>Code</label>
                <input type="text" value={editCode} disabled />
              </div>

              <div className="admin-form-row">
                <label>Display Name</label>
                <input
                  type="text"
                  value={editPlace.name || ""}
                  onChange={(e) => updateField("name", e.target.value || undefined)}
                  placeholder={scope === "countries" ? countryName(editCode) : US_STATE_META[editCode]?.name || ""}
                />
              </div>

              <div className="admin-form-row">
                <label>Status</label>
                <select
                  value={editPlace.status}
                  onChange={(e) => updateField("status", e.target.value as PlaceStatus)}
                >
                  {(["visited", "seen", "planned", "want", "lived"] as const).map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              <div className="admin-form-row">
                <label>Years</label>
                <div className="admin-years">
                  {(editPlace.years || []).map((y) => (
                    <span key={y} className="admin-year-tag">
                      {y}
                      <button onClick={() => removeYear(y)} type="button">×</button>
                    </span>
                  ))}
                  <YearInput onAdd={addYear} />
                </div>
              </div>

              <div className="admin-form-row">
                <label>Cities</label>
                <div className="admin-cities">
                  {(editPlace.cities || []).map((city, i) => (
                    <div key={i} className="admin-city-row">
                      <input
                        type="text"
                        placeholder="City name"
                        value={city.name}
                        onChange={(e) => updateCity(i, "name", e.target.value)}
                      />
                      <input
                        type="number"
                        placeholder="Lat"
                        value={city.lat}
                        step="any"
                        onChange={(e) => updateCity(i, "lat", parseFloat(e.target.value) || 0)}
                      />
                      <input
                        type="number"
                        placeholder="Lng"
                        value={city.lng}
                        step="any"
                        onChange={(e) => updateCity(i, "lng", parseFloat(e.target.value) || 0)}
                      />
                      <select value={city.kind} onChange={(e) => updateCity(i, "kind", e.target.value)}>
                        <option value="visited">Visited</option>
                        <option value="lived">Lived</option>
                        <option value="want">Want</option>
                      </select>
                      <button onClick={() => removeCity(i)} type="button" className="admin-remove-btn">×</button>
                    </div>
                  ))}
                  <button onClick={addCity} type="button" className="admin-add-btn">+ Add city</button>
                </div>
              </div>

              <div className="admin-form-row">
                <label>Post Title</label>
                <input
                  type="text"
                  value={editPlace.post?.title || ""}
                  onChange={(e) =>
                    updateField("post", {
                      ...(editPlace.post || {}),
                      title: e.target.value || undefined,
                      body: editPlace.post?.body,
                    })
                  }
                />
              </div>

              <div className="admin-form-row">
                <label>Post Body</label>
                <textarea
                  rows={3}
                  value={editPlace.post?.body || ""}
                  onChange={(e) =>
                    updateField("post", {
                      ...(editPlace.post || {}),
                      title: editPlace.post?.title,
                      body: e.target.value || undefined,
                    })
                  }
                />
              </div>

              <div className="admin-form-row">
                <label>Blog Post Slug</label>
                <input
                  type="text"
                  value={editPlace.blogPostSlug || ""}
                  onChange={(e) => updateField("blogPostSlug", e.target.value || undefined)}
                  placeholder="e.g. travel-map-d3-geo"
                />
              </div>

              <div className="admin-actions">
                <button className="admin-save-btn" onClick={savePlace} disabled={saving || !canSave}>
                  {saving ? "Saving..." : canSave ? "Save" : "Sign in to save"}
                </button>
                <button className="admin-delete-btn" onClick={() => deletePlace(editCode)} disabled={!canSave}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="admin-empty">
              <p>Select a place from the list to edit, or add a new one.</p>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .admin-shell {
          min-height: 100vh;
          background: #06060c;
          color: #f4f4fb;
          font-family: 'Inter', system-ui, sans-serif;
          display: flex;
          flex-direction: column;
        }
        .admin-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.09);
          background: rgba(10,10,18,0.8);
          backdrop-filter: blur(18px);
        }
        .admin-header h1 {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }
        .admin-auth {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .admin-auth-input {
          padding: 6px 8px;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 6px;
          background: rgba(255,255,255,0.03);
          color: #f4f4fb;
          font-size: 12px;
          outline: none;
          width: 180px;
        }
        .admin-link-btn {
          border: none;
          background: transparent;
          color: #22d3ee;
          font-size: 12px;
          cursor: pointer;
          padding: 0;
        }
        .admin-toast {
          padding: 4px 12px;
          border-radius: 6px;
          background: rgba(34,211,238,0.15);
          color: #22d3ee;
          font-size: 13px;
        }
        .admin-loading {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #06060c;
          color: #7b7b95;
        }
        .admin-layout {
          display: flex;
          flex: 1;
          min-height: 0;
        }
        .admin-sidebar {
          width: 280px;
          border-right: 1px solid rgba(255,255,255,0.09);
          display: flex;
          flex-direction: column;
          background: rgba(10,10,18,0.5);
        }
        .admin-tabs {
          display: flex;
          border-bottom: 1px solid rgba(255,255,255,0.09);
        }
        .admin-tabs button {
          flex: 1;
          padding: 10px;
          border: none;
          background: transparent;
          color: #7b7b95;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .admin-tabs button.active {
          color: #f4f4fb;
          border-bottom: 2px solid #22d3ee;
        }
        .admin-tabs button:hover {
          color: #f4f4fb;
        }
        .admin-add {
          display: flex;
          gap: 4px;
          padding: 8px;
          border-bottom: 1px solid rgba(255,255,255,0.09);
        }
        .admin-add input {
          flex: 1;
          padding: 6px 8px;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 6px;
          background: rgba(255,255,255,0.03);
          color: #f4f4fb;
          font-size: 12px;
          outline: none;
        }
        .admin-add input:focus {
          border-color: rgba(34,211,238,0.4);
        }
        .admin-add button {
          width: 32px;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 6px;
          background: rgba(34,211,238,0.15);
          color: #22d3ee;
          font-size: 16px;
          cursor: pointer;
        }
        .admin-add button:disabled {
          opacity: 0.3;
          cursor: default;
        }
        .admin-add-dropdown {
          position: absolute;
          top: calc(100% + 2px);
          left: 0;
          right: 0;
          max-height: 260px;
          overflow-y: auto;
          background: #0a0a12;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 6px;
          z-index: 30;
          box-shadow: 0 18px 48px rgba(0,0,0,0.4);
        }
        .admin-add-dropdown button {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 6px 10px;
          border: none;
          background: transparent;
          color: #c2c2d6;
          font-size: 13px;
          cursor: pointer;
          text-align: left;
        }
        .admin-add-dropdown button:hover {
          background: rgba(34,211,238,0.1);
          color: #f4f4fb;
        }
        .admin-add-code {
          margin-left: auto;
          font-size: 11px;
          color: #7b7b95;
          font-family: monospace;
        }
        .admin-list {
          flex: 1;
          overflow-y: auto;
          padding: 4px;
        }
        .admin-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 6px 8px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: #c2c2d6;
          font-size: 13px;
          cursor: pointer;
          text-align: left;
          transition: all 0.1s;
        }
        .admin-item:hover {
          background: rgba(255,255,255,0.05);
        }
        .admin-item.active {
          background: rgba(34,211,238,0.1);
          color: #f4f4fb;
        }
        .admin-item-flag {
          font-size: 16px;
          width: 20px;
          text-align: center;
        }
        .admin-item-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .admin-item-status {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .admin-editor {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }
        .admin-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #7b7b95;
        }
        .admin-form {
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .admin-form-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .admin-form-row label {
          font-size: 12px;
          font-weight: 500;
          color: #7b7b95;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .admin-form-row input,
        .admin-form-row select,
        .admin-form-row textarea {
          padding: 8px 10px;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 6px;
          background: rgba(255,255,255,0.03);
          color: #f4f4fb;
          font-size: 13px;
          outline: none;
          font-family: inherit;
        }
        .admin-form-row input:focus,
        .admin-form-row select:focus,
        .admin-form-row textarea:focus {
          border-color: rgba(34,211,238,0.4);
        }
        .admin-form-row input:disabled {
          opacity: 0.5;
        }
        .admin-form-row textarea {
          resize: vertical;
        }
        .admin-years {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
        }
        .admin-year-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 4px;
          background: rgba(255,255,255,0.06);
          font-size: 12px;
        }
        .admin-year-tag button {
          border: none;
          background: transparent;
          color: #f472b6;
          cursor: pointer;
          font-size: 14px;
          padding: 0;
          line-height: 1;
        }
        .admin-cities {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .admin-city-row {
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .admin-city-row input,
        .admin-city-row select {
          padding: 4px 6px;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 4px;
          background: rgba(255,255,255,0.03);
          color: #f4f4fb;
          font-size: 12px;
          outline: none;
        }
        .admin-city-row input:first-child {
          flex: 2;
        }
        .admin-city-row input[type="number"] {
          width: 70px;
        }
        .admin-city-row select {
          width: 80px;
        }
        .admin-remove-btn {
          border: none;
          background: transparent;
          color: #f472b6;
          cursor: pointer;
          font-size: 16px;
          padding: 0 4px;
        }
        .admin-add-btn {
          align-self: flex-start;
          padding: 4px 10px;
          border: 1px dashed rgba(255,255,255,0.15);
          border-radius: 4px;
          background: transparent;
          color: #7b7b95;
          font-size: 12px;
          cursor: pointer;
        }
        .admin-add-btn:hover {
          border-color: rgba(34,211,238,0.3);
          color: #22d3ee;
        }
        .admin-actions {
          display: flex;
          gap: 8px;
          padding-top: 8px;
        }
        .admin-save-btn {
          padding: 8px 20px;
          border: none;
          border-radius: 6px;
          background: rgba(34,211,238,0.2);
          color: #22d3ee;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }
        .admin-save-btn:hover {
          background: rgba(34,211,238,0.3);
        }
        .admin-save-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .admin-delete-btn {
          padding: 8px 20px;
          border: 1px solid rgba(244,114,182,0.3);
          border-radius: 6px;
          background: transparent;
          color: #f472b6;
          font-size: 13px;
          cursor: pointer;
        }
        .admin-delete-btn:hover {
          background: rgba(244,114,182,0.1);
        }
        .admin-delete-btn:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .muted {
          color: #7b7b95;
          font-size: 13px;
          margin: 0;
        }
      `}</style>
    </div>
  );
}

function YearInput({ onAdd }: { onAdd: (year: number) => void }) {
  const [value, setValue] = useState("");
  return (
    <input
      type="number"
      placeholder="Add year"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value) {
          onAdd(parseInt(value, 10));
          setValue("");
        }
      }}
      style={{
        width: 80,
        padding: "2px 6px",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 4,
        background: "rgba(255,255,255,0.03)",
        color: "#f4f4fb",
        fontSize: 12,
        outline: "none",
      }}
    />
  );
}
