// src/utils/api.js

export function getApiBaseUrl() {
  const raw =
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

  return (raw || "").replace(/\/$/, "");
}

export function normalizeGeoJSON(input) {
  if (!input) return null;

  // DRF-GIS GeoJsonPagination
  if (input.type === "FeatureCollection" && Array.isArray(input.features)) {
    return input;
  }

  // DRF classic pagination
  if (Array.isArray(input.results)) {
    return { type: "FeatureCollection", features: input.results };
  }

  // list
  if (Array.isArray(input)) {
    return { type: "FeatureCollection", features: input };
  }

  // single feature
  if (input.type === "Feature") {
    return { type: "FeatureCollection", features: [input] };
  }

  return null;
}

export async function fetchGeoJSON(url, { signal } = {}) {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);

  const json = await res.json();
  const normalized = normalizeGeoJSON(json);

  if (!normalized) {
    console.warn("Réponse API non reconnue (GeoJSON attendu):", json);
  }

  return normalized;
}
