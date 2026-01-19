import { useEffect, useState } from "react";
import "./App.css";
import Carte from "./component/Carte";

function App() {
  const [hopitauxData, setHopitauxData] = useState(null);
  const [ecolesData, setEcolesData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("http://127.0.0.1:8000/api/hopitaux/").then((res) => {
        if (!res.ok) throw new Error(`Hopitaux HTTP ${res.status}`);
        return res.json();
      }),
      fetch("http://127.0.0.1:8000/api/ecoles/").then((res) => {
        if (!res.ok) throw new Error(`Ecoles HTTP ${res.status}`);
        return res.json();
      }),
    ])
      .then(([h, e]) => {
        setHopitauxData(h);
        setEcolesData(e);
      })
      .catch((err) => {
        console.error("Erreur fetch :", err);
        setError(err.message);
      });
  }, []);

  if (error) return <div>Erreur API: {error}</div>;
  if (!hopitauxData || !ecolesData) return <div>Chargement des données...</div>;

  return <Carte hopitauxData={hopitauxData} ecolesData={ecolesData} />;
}

export default App;
