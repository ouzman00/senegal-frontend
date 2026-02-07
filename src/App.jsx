import { useEffect, useMemo, useState } from "react";
import "./App.css";
import Carte from "./component/Carte";
import { fetchGeoJSON, getApiBaseUrl } from "./utils/api";

// ✅ 1 config = 1 couche API
const API_LAYERS = [
  { id: "hopitaux", endpoint: "/api/hopitaux/?page_size=1000" },
  { id: "ecoles", endpoint: "/api/ecoles/?page_size=1000" },
  { id: "parcelles", endpoint: "/api/parcelles/?page_size=1000" },
  { id: "Commerce", endpoint: "/api/commerce/?page_size=1000" },

  // ➕ demain: { id: "pharmacies", endpoint: "/api/pharmacies/?page_size=1000" },
];

export default function App() {
  const API_BASE_URL = useMemo(() => getApiBaseUrl(), []);
  const [dataByLayer, setDataByLayer] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!API_BASE_URL) {
      setError("VITE_API_BASE_URL n'est pas défini en production.");
      setLoading(false);
      return;
    }

    const abort = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const entries = await Promise.all(
          API_LAYERS.map(async ({ id, endpoint }) => {
            const url = `${API_BASE_URL}${endpoint}`;
            const geojson = await fetchGeoJSON(url, { signal: abort.signal });
            return [id, geojson];
          })
        );

        const obj = Object.fromEntries(entries);
        setDataByLayer(obj);

        entries.forEach(([id, g]) =>
          console.log(`${id} features:`, g?.features?.length ?? 0)
        );
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    })();

    return () => abort.abort();
  }, [API_BASE_URL]);

  if (loading) return <div>Chargement des données...</div>;
  if (error) return <div>Erreur API: {error}</div>;

  // ✅ Carte reçoit toutes les couches dans un seul objet
  return <Carte dataByLayer={dataByLayer} />;
}
