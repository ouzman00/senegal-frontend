import { useEffect, useMemo, useState } from "react";
import "./App.css";
import Carte from "./component/Carte";
import { fetchGeoJSON, getApiBaseUrl } from "./utils/api";

export default function App() {
  const API_BASE_URL = useMemo(() => getApiBaseUrl(), []);
  const [hopitauxData, setHopitauxData] = useState(null);
  const [ecolesData, setEcolesData] = useState(null);
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

        const hopUrl = `${API_BASE_URL}/api/hopitaux/?page_size=1000`;
        const ecoUrl = `${API_BASE_URL}/api/ecoles/?page_size=1000`;

        const hop = await fetchGeoJSON(hopUrl, { signal: abort.signal });
        const eco = await fetchGeoJSON(ecoUrl, { signal: abort.signal });

        setHopitauxData(hop);
        setEcolesData(eco);

        console.log("Hopitaux features:", hop?.features?.length ?? 0);
        console.log("Ecoles features:", eco?.features?.length ?? 0);
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

  return <Carte hopitauxData={hopitauxData} ecolesData={ecolesData} />;
}
