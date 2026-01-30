import { useEffect, useMemo, useState } from "react";
import "./App.css";
import Carte from "./component/Carte";

export default function App() {
  const API_BASE_URL = useMemo(() => {
    const base =
      import.meta.env.VITE_API_BASE_URL ||
      (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");
    return (base || "").replace(/\/$/, "");
  }, []);

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

    const fetchGeojson = async (url, label, optional = false) => {
      const res = await fetch(url, { signal: abort.signal });
      if (!res.ok) {
        if (optional) return null; // ✅ ne bloque pas tout
        throw new Error(`${label} HTTP ${res.status} (${url})`);
      }
      return res.json();
    };

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const hop = await fetchGeojson(`${API_BASE_URL}/api/hopitaux/`, "Hopitaux");
        const eco = await fetchGeojson(`${API_BASE_URL}/api/ecoles/`, "Ecoles", true);

        setHopitauxData(hop);
        setEcolesData(eco);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Erreur API :", err);
          setError(err.message || "Erreur inconnue");
        }
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
