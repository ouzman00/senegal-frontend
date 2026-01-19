import React, { useEffect, useMemo, useState } from "react";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Snap from "ol/interaction/Snap";
import Select from "ol/interaction/Select";
import { click } from "ol/events/condition";
import GeoJSON from "ol/format/GeoJSON";

export default function MapEditor({
  map,
  editableLayer,          // VectorLayer (ta couche postgis)
  apiBaseUrl = "http://127.0.0.1:8000/api/hopitaux/",
}) {
  const [mode, setMode] = useState("none"); // none | draw | modify
  const [selectedId, setSelectedId] = useState(null);
  const geojson = useMemo(() => new GeoJSON(), []);

  // Sélection (pour delete)
  useEffect(() => {
    if (!map || !editableLayer) return;

    const select = new Select({
      condition: click,
      layers: [editableLayer],
    });

    select.on("select", (e) => {
      const f = e.selected?.[0] || null;
      setSelectedId(f ? f.getId() : null);
    });

    map.addInteraction(select);
    return () => map.removeInteraction(select);
  }, [map, editableLayer]);

  // Draw / Modify / Snap
  useEffect(() => {
    if (!map || !editableLayer) return;

    const source = editableLayer.getSource();
    if (!source) return;

    let draw = null;
    let modify = null;
    const snap = new Snap({ source });

    if (mode === "draw") {
      draw = new Draw({ source, type: "Point" });

      // Quand on finit de dessiner : POST vers Django
      draw.on("drawend", async (evt) => {
        const feature = evt.feature;

        // convertir la feature en GeoJSON (EPSG:4326) pour l’API
        const geo = geojson.writeFeatureObject(feature, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });

        const payload = {
          nom: "Nouveau hopital",
          adresse: null,
          geom: geo.geometry, // {"type":"Point","coordinates":[lon,lat]}
        };

        try {
          const res = await fetch(apiBaseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(`POST failed: HTTP ${res.status}`);
          const created = await res.json();

          // donner l'id Django à la feature OL
          feature.setId(created.id);
          feature.set("layerName", "Hôpitaux");
          feature.set("nom", created.properties?.nom ?? created.nom ?? payload.nom);
          feature.set("adresse", created.properties?.adresse ?? created.adresse ?? null);
        } catch (err) {
          console.error(err);
          // rollback local si l’API échoue
          source.removeFeature(feature);
          alert("Création impossible (API). Regarde la console.");
        }
      });
    }

    if (mode === "modify") {
      modify = new Modify({ source });

      // Sur fin de modification : PATCH vers Django
      modify.on("modifyend", async (evt) => {
        const features = evt.features.getArray();

        for (const feature of features) {
          const id = feature.getId();
          if (!id) continue;

          const geo = geojson.writeFeatureObject(feature, {
            dataProjection: "EPSG:4326",
            featureProjection: "EPSG:3857",
          });

          const payload = { geom: geo.geometry };

          try {
            const res = await fetch(`${apiBaseUrl}${id}/`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`PATCH failed: HTTP ${res.status}`);
          } catch (err) {
            console.error(err);
            alert("Modification non enregistrée (API). Regarde la console.");
          }
        }
      });
    }

    if (draw) map.addInteraction(draw);
    if (modify) map.addInteraction(modify);
    map.addInteraction(snap);

    return () => {
      if (draw) map.removeInteraction(draw);
      if (modify) map.removeInteraction(modify);
      map.removeInteraction(snap);
    };
  }, [map, editableLayer, mode, apiBaseUrl, geojson]);

  const deleteSelected = async () => {
    if (!editableLayer) return;
    const source = editableLayer.getSource();
    if (!source) return;

    const id = selectedId;
    if (!id) return alert("Sélectionne un hôpital à supprimer.");

    // suppression API puis suppression locale
    try {
      const res = await fetch(`${apiBaseUrl}${id}/`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`DELETE failed: HTTP ${res.status}`);

      const f = source.getFeatureById(id);
      if (f) source.removeFeature(f);
      setSelectedId(null);
    } catch (err) {
      console.error(err);
      alert("Suppression impossible (API). Regarde la console.");
    }
  };

  return (
  <div className="p-4 bg-white border border-gray-300 rounded-xl shadow-md flex flex-col gap-3">
    <div className="font-semibold">Éditeur (Hôpitaux)</div>

    <div className="flex gap-2 flex-wrap">
      <button
        className={`px-4 py-2 rounded-xl ${
          mode === "draw" ? "bg-gray-800 text-white" : "bg-gray-200"
        }`}
        onClick={() => setMode((m) => (m === "draw" ? "none" : "draw"))}
      >
        {mode === "draw" ? "Arrêter Draw" : "Draw point"}
      </button>

      <button
        className={`px-4 py-2 rounded-xl ${
          mode === "modify" ? "bg-gray-800 text-white" : "bg-gray-200"
        }`}
        onClick={() => setMode((m) => (m === "modify" ? "none" : "modify"))}
      >
        {mode === "modify" ? "Arrêter Modify" : "Modify"}
      </button>

      <button
        className="px-4 py-2 rounded-xl bg-red-200"
        onClick={deleteSelected}
      >
        Delete sélection
      </button>
    </div>

    <div className="text-xs text-gray-600">
      Sélection: {selectedId ? `ID ${selectedId}` : "aucune"}
    </div>
  </div>
);

}
