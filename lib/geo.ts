import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import type { PlaceStatus } from "@/lib/schema";

countries.registerLocale(enLocale);

export const STATUS_LABELS: Record<PlaceStatus, string> = {
  visited: "Visited",
  seen: "Seen",
  planned: "Planned",
  want: "Want to go",
  lived: "Lived there"
};

export const STATUS_COLORS: Record<PlaceStatus, string> = {
  visited: "#22d3ee",
  seen: "#a855f7",
  planned: "#4ade80",
  want: "#fbbf24",
  lived: "#f472b6"
};

export const EMPTY_REGION_COLOR = "#1a1a2e";

export const SELECTED_REGION_COLOR = "#22d3ee";

export const US_STATE_META: Record<string, { name: string; fips: string }> = {
  "US-AL": { name: "Alabama", fips: "01" },
  "US-AK": { name: "Alaska", fips: "02" },
  "US-AZ": { name: "Arizona", fips: "04" },
  "US-AR": { name: "Arkansas", fips: "05" },
  "US-CA": { name: "California", fips: "06" },
  "US-CO": { name: "Colorado", fips: "08" },
  "US-CT": { name: "Connecticut", fips: "09" },
  "US-DE": { name: "Delaware", fips: "10" },
  "US-DC": { name: "District of Columbia", fips: "11" },
  "US-FL": { name: "Florida", fips: "12" },
  "US-GA": { name: "Georgia", fips: "13" },
  "US-HI": { name: "Hawaii", fips: "15" },
  "US-ID": { name: "Idaho", fips: "16" },
  "US-IL": { name: "Illinois", fips: "17" },
  "US-IN": { name: "Indiana", fips: "18" },
  "US-IA": { name: "Iowa", fips: "19" },
  "US-KS": { name: "Kansas", fips: "20" },
  "US-KY": { name: "Kentucky", fips: "21" },
  "US-LA": { name: "Louisiana", fips: "22" },
  "US-ME": { name: "Maine", fips: "23" },
  "US-MD": { name: "Maryland", fips: "24" },
  "US-MA": { name: "Massachusetts", fips: "25" },
  "US-MI": { name: "Michigan", fips: "26" },
  "US-MN": { name: "Minnesota", fips: "27" },
  "US-MS": { name: "Mississippi", fips: "28" },
  "US-MO": { name: "Missouri", fips: "29" },
  "US-MT": { name: "Montana", fips: "30" },
  "US-NE": { name: "Nebraska", fips: "31" },
  "US-NV": { name: "Nevada", fips: "32" },
  "US-NH": { name: "New Hampshire", fips: "33" },
  "US-NJ": { name: "New Jersey", fips: "34" },
  "US-NM": { name: "New Mexico", fips: "35" },
  "US-NY": { name: "New York", fips: "36" },
  "US-NC": { name: "North Carolina", fips: "37" },
  "US-ND": { name: "North Dakota", fips: "38" },
  "US-OH": { name: "Ohio", fips: "39" },
  "US-OK": { name: "Oklahoma", fips: "40" },
  "US-OR": { name: "Oregon", fips: "41" },
  "US-PA": { name: "Pennsylvania", fips: "42" },
  "US-RI": { name: "Rhode Island", fips: "44" },
  "US-SC": { name: "South Carolina", fips: "45" },
  "US-SD": { name: "South Dakota", fips: "46" },
  "US-TN": { name: "Tennessee", fips: "47" },
  "US-TX": { name: "Texas", fips: "48" },
  "US-UT": { name: "Utah", fips: "49" },
  "US-VT": { name: "Vermont", fips: "50" },
  "US-VA": { name: "Virginia", fips: "51" },
  "US-WA": { name: "Washington", fips: "53" },
  "US-WV": { name: "West Virginia", fips: "54" },
  "US-WI": { name: "Wisconsin", fips: "55" },
  "US-WY": { name: "Wyoming", fips: "56" }
};

export const STATE_BY_FIPS = Object.fromEntries(
  Object.entries(US_STATE_META).map(([code, meta]) => [meta.fips, { code, ...meta }])
);

export type PlaceOption = {
  code: string;
  name: string;
  searchTerms: string[];
};

export type CityOption = {
  name: string;
  lat: number;
  lng: number;
  searchTerms: string[];
};

export function stripDiacritics(input: string) {
  return input.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function normalizeSearchTerm(input: string) {
  return stripDiacritics(input).toLowerCase().trim();
}

const MIN_WORD_TERM_LENGTH = 4;

function buildSearchTerms(values: string[]) {
  const terms = new Set<string>();

  for (const value of values) {
    const normalized = normalizeSearchTerm(value);

    if (!normalized) {
      continue;
    }

    terms.add(normalized);

    const words = normalized.split(/[^a-z0-9]+/).filter(Boolean);

    for (let index = 1; index < words.length; index += 1) {
      const word = words[index];

      if (word.length >= MIN_WORD_TERM_LENGTH) {
        terms.add(word);
      }
    }
  }

  return Array.from(terms);
}

const countryNameVariants = countries.getNames("en", { select: "all" });
const primaryCountryNames = countries.getNames("en");

export const COUNTRY_OPTIONS: PlaceOption[] = Object.keys(countryNameVariants)
  .filter((code) => /^[A-Z]{2}$/.test(code))
  .map((code) => {
    const variants = countryNameVariants[code];
    const namesArray = Array.isArray(variants) ? variants : [variants];
    return {
      code,
      name: primaryCountryNames[code] || namesArray[0],
      searchTerms: buildSearchTerms([...namesArray, code])
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export const STATE_OPTIONS: PlaceOption[] = Object.entries(US_STATE_META)
  .map(([code, meta]) => ({
    code,
    name: meta.name,
    searchTerms: buildSearchTerms([meta.name, code, code.replace("US-", "")])
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const CITY_OPTIONS_BY_PLACE: Record<string, CityOption[]> = {
  FR: createCityOptions([{ name: "Paris", lat: 48.8566, lng: 2.3522 }]),
  IS: createCityOptions([{ name: "Reykjavik", lat: 64.1466, lng: -21.9426 }]),
  IT: createCityOptions([{ name: "Rome", lat: 41.9028, lng: 12.4964 }]),
  JP: createCityOptions([
    { name: "Tokyo", lat: 35.6762, lng: 139.6503 },
    { name: "Kyoto", lat: 35.0116, lng: 135.7681 },
    { name: "Osaka", lat: 34.6937, lng: 135.5023 }
  ]),
  "US-AL": createCityOptions([
    { name: "Huntsville", lat: 34.7304, lng: -86.5861 },
    { name: "Birmingham", lat: 33.5186, lng: -86.8104 },
    { name: "Montgomery", lat: 32.3668, lng: -86.3 },
    { name: "Mobile", lat: 30.6954, lng: -88.0399 }
  ]),
  "US-CA": createCityOptions([
    { name: "Los Angeles", lat: 34.0522, lng: -118.2437 },
    { name: "San Diego", lat: 32.7157, lng: -117.1611 },
    { name: "San Francisco", lat: 37.7749, lng: -122.4194 }
  ]),
  "US-ME": createCityOptions([{ name: "Portland", lat: 43.6591, lng: -70.2568 }]),
  "US-NY": createCityOptions([
    { name: "New York City", lat: 40.7128, lng: -74.006 },
    { name: "Buffalo", lat: 42.8864, lng: -78.8784 }
  ]),
  "US-TX": createCityOptions([
    { name: "Abilene", lat: 32.4487, lng: -99.7331 },
    { name: "Austin", lat: 30.2672, lng: -97.7431 },
    { name: "Dallas", lat: 32.7767, lng: -96.797 },
    { name: "Houston", lat: 29.7604, lng: -95.3698 },
    { name: "San Antonio", lat: 29.4241, lng: -98.4936 }
  ])
};

export function countryTopoId(alpha2: string) {
  const numeric = countries.alpha2ToNumeric(alpha2.toUpperCase());
  return numeric ? numeric.padStart(3, "0") : alpha2.toUpperCase();
}

export function countryCodeFromTopoId(id: string | number | undefined) {
  if (id === undefined) {
    return undefined;
  }

  return countries.numericToAlpha2(String(id).padStart(3, "0")) || undefined;
}

export function countryName(alpha2: string) {
  return countries.getName(alpha2.toUpperCase(), "en") || alpha2.toUpperCase();
}

export function flagEmoji(alpha2: string) {
  const code = alpha2.toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) {
    return "";
  }

  return code
    .split("")
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

export function normalizeCountryCode(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeStateCode(value: string) {
  const trimmed = value.trim().toUpperCase();
  return trimmed.startsWith("US-") ? trimmed : `US-${trimmed}`;
}

function createCityOptions(cities: Array<{ name: string; lat: number; lng: number }>) {
  return cities
    .map((city) => ({
      ...city,
      searchTerms: buildSearchTerms([city.name])
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
