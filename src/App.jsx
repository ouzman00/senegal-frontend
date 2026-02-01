import { useEffect, useMemo, useState } from "react";
import "./App.css";
import Carte from "./component/Carte";
import { fetchGeoJSON, getApiBaseUrl } from "./utils/api";

export default function App() {
  const API_BASE_URL = useMemo(() => getApiBaseUrl(), []);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_LAYERS = useMemo(
    () => [
      { id: "hopitaux", path: "/api/hopitaux/?page_size=2000" },
      { id: "ecoles", path: "/api/ecoles/?page_size=2000" },
    ],
    []
  );

  useEffect(() => {
    console.log("API_BASE_URL =", API_BASE_URL);

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

        const results = await Promise.allSettled(
          API_LAYERS.map(async (l) => {
            const url = `${API_BASE_URL}${l.path}`;
            const fc = await fetchGeoJSON(url, { signal: abort.signal });
            return [l.id, fc];
          })
        );

        const obj = {};
        const failed = [];

        for (const r of results) {
          if (r.status === "fulfilled") {
            const [id, fc] = r.value;
            obj[id] = fc;
            console.log(`${id} fc features:`, fc?.features?.length ?? 0);
          } else {
            failed.push(r.reason?.message || String(r.reason));
          }
        }

        console.log("DATA keys =", Object.keys(obj));
        console.log("HOP sample =", obj.hopitaux?.features?.[0]);
        console.log("ECO sample =", obj.ecoles?.features?.[0]);

        setData(obj);

        if (failed.length) {
          console.warn("Certaines couches API n'ont pas pu être chargées:", failed);
        }
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    })();

    return () => abort.abort();
  }, [API_BASE_URL, API_LAYERS]);

  if (loading) return <div>Chargement des données...</div>;
  if (error) return <div>Erreur API: {error}</div>;

  return <Carte data={data} />;
}
