import React, { useEffect, useMemo, useState } from "react";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Snap from "ol/interaction/Snap";
import Select from "ol/interaction/Select";
import { click } from "ol/events/condition";
import GeoJSON from "ol/format/GeoJSON";

export default function MapEditor({
  map,
  editableLayer,
  apiBaseUrl,
  drawType = "Point",
  defaultName = "Nouvel objet",
}) {
  const [mode, setMode] = useState("none");
  const [selectedId, setSelectedId] = useState(null);
  const geojson = useMemo(() => new GeoJSON(), []);

  if (!apiBaseUrl) {
    console.error("MapEditor: apiBaseUrl manquant");
    return (
      <div className="p-3 bg-red-100 border border-red-300 rounded">
        MapEditor désactivé (API non configurée)
      </div>
    );
  }

  // =======================
  // SELECT
  // =======================
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

  // =======================
  // DRAW / MODIFY / SNAP
  // =======================
  useEffect(() => {
    if (!map || !editableLayer) return;

    const source = editableLayer.getSource();
    if (!source) return;

    let draw = null;
    let modify = null;
    const snap = new Snap({ source });

    // -------- DRAW --------
    if (mode === "draw") {
      draw = new Draw({ source, type: drawType });

      draw.on("drawend", async (evt) => {
        const feature = evt.feature;

        const geo = geojson.writeFeatureObject(feature, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });

        // Envoyer un GeoJSON Feature
        const payload = {
          type: "Feature",
          geometry: geo.geometry,
          properties: {
            nom: feature.get("nom") ?? defaultName,
            adresse: feature.get("adresse") ?? null,
          },
        };

        try {
          const res = await fetch(apiBaseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!res.ok) throw new Error(`POST HTTP ${res.status}`);

          const created = await res.json();

          feature.setId(created.id);

          const props = created.properties ?? created;
          feature.set("nom", props.nom ?? defaultName);
          feature.set("adresse", props.adresse ?? null);
        } catch (err) {
          console.error("MapEditor POST:", err);
          source.removeFeature(feature);
          alert("Création impossible (API)");
        }
      });
    }

    // -------- MODIFY --------
    if (mode === "modify") {
      modify = new Modify({ source });

      modify.on("modifyend", async (evt) => {
        for (const feature of evt.features.getArray()) {
          const id = feature.getId();
          if (!id) continue;

          const geo = geojson.writeFeatureObject(feature, {
            dataProjection: "EPSG:4326",
            featureProjection: "EPSG:3857",
          });

          // ✅ PATCH en Feature (robuste) — plus d'accolade en trop ici
          const payload = {
            type: "Feature",
            geometry: geo.geometry,
            properties: {
              nom: feature.get("nom") ?? defaultName,
              adresse: feature.get("adresse") ?? null,
            },
          };

          try {
            const res = await fetch(`${apiBaseUrl}${id}/`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error(`PATCH HTTP ${res.status}`);
          } catch (err) {
            console.error("MapEditor PATCH:", err);
            alert("Modification non enregistrée");
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
  }, [map, editableLayer, mode, apiBaseUrl, geojson, drawType, defaultName]);

  // =======================
  // DELETE
  // =======================
  const deleteSelected = async () => {
    if (!editableLayer || !selectedId) {
      alert("Sélectionne un objet");
      return;
    }

    try {
      const res = await fetch(`${apiBaseUrl}${selectedId}/`, {
        method: "DELETE",
      });

      if (!res.ok && res.status !== 204) {
        throw new Error(`DELETE HTTP ${res.status}`);
      }

      const src = editableLayer.getSource();
      src.removeFeature(src.getFeatureById(selectedId));
      setSelectedId(null);
    } catch (err) {
      console.error("MapEditor DELETE:", err);
      alert("Suppression impossible");
    }
  };

  return (
    <div className="p-3 bg-white border border-gray-300 rounded-lg shadow flex flex-col gap-2">
      <div className="font-semibold">
        Éditeur ({drawType === "Polygon" ? "Surface" : "Point"})
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          className={`px-3 py-1 rounded ${
            mode === "draw" ? "bg-gray-800 text-white" : "bg-gray-200"
          }`}
          onClick={() => setMode(mode === "draw" ? "none" : "draw")}
        >
          Draw {drawType}
        </button>

        <button
          className={`px-3 py-1 rounded ${
            mode === "modify" ? "bg-gray-800 text-white" : "bg-gray-200"
          }`}
          onClick={() => setMode(mode === "modify" ? "none" : "modify")}
        >
          Modify
        </button>

        <button className="px-3 py-1 rounded bg-red-200" onClick={deleteSelected}>
          Delete
        </button>
      </div>

      <div className="text-xs text-gray-600">
        Sélection : {selectedId ? `ID ${selectedId}` : "aucune"}
      </div>
    </div>
  );
}
