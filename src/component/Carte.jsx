import React, { useEffect, useMemo, useRef, useState } from "react";
import "ol/ol.css";
import { Map, View } from "ol";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat } from "ol/proj";
import { Style, Stroke, Fill, Circle as CircleStyle } from "ol/style";

import { getApiBaseUrl } from "../utils/api";

import Coordonnees from "./Coordonnees";
import MapEditor from "./MapEditor";
import RegionChart from "./RegionChart";
import Population from "./Population";
import Mesures from "./Mesures";
import Echelle from "./Echelle";
import Recherche from "./Recherche";

function withBase(path) {
  // utile si ton app est servie dans un sous-dossier (rare sur Vercel, mais safe)
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

async function fetchStaticGeoJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  return res.json();
}

export default function Carte({ hopitauxData, ecolesData }) {
  const API_BASE_URL = useMemo(() => getApiBaseUrl(), []);

  const mapRef = useRef(null);
  const [map, setMap] = useState(null);

  const [layers, setLayers] = useState({
    Regions: null,
    Communes: null,
    hopitaux: null,
    ecoles: null,
    highlight: null,
    overlay: null,
  });

  const staticLayersRef = useRef({ Regions: null, Communes: null });

  const [visibleLayers, setVisibleLayers] = useState({
    Regions: true,
    Communes: true,
    hopitaux: true,
    ecoles: false,
  });

  const visibleLayersRef = useRef(visibleLayers);
  useEffect(() => {
    visibleLayersRef.current = visibleLayers;
  }, [visibleLayers]);

  const [baseMapType, setBaseMapType] = useState("osm");
  const [selectedFeature, setSelectedFeature] = useState(null);

  const layerConfigs = useMemo(
    () => [
      {
        id: "Regions",
        url: withBase("/donnees_shp/regions.geojson"),
        color: "#1E0F1C",
        width: 3,
        fill: "rgba(255,0,0,0)",
        name: "Régions",
      },
      {
        id: "Communes",
        url: withBase("/donnees_shp/communes.geojson"),
        color: "#A7001E",
        width: 1,
        fill: "rgba(255,0,0,0)",
        name: "Communes",
      },
    ],
    []
  );

  // =======================
  // INIT MAP
  // =======================
  useEffect(() => {
    if (!mapRef.current) return;

    const baseLayer = new TileLayer({ source: new OSM() });

    const mapInstance = new Map({
      target: mapRef.current,
      layers: [baseLayer],
      view: new View({
        center: fromLonLat([-14.5, 14.5]),
        zoom: 8,
      }),
    });

    const highlightLayer = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        image: new CircleStyle({
          radius: 10,
          stroke: new Stroke({ color: "#FFD700", width: 3 }),
          fill: new Fill({ color: "rgba(255,215,0,0.3)" }),
        }),
        stroke: new Stroke({ color: "#FFD700", width: 3 }),
        fill: new Fill({ color: "rgba(255,215,0,0.15)" }),
      }),
    });
    mapInstance.addLayer(highlightLayer);

    const overlayLayer = new VectorLayer({
      source: new VectorSource(),
      visible: false,
    });
    mapInstance.addLayer(overlayLayer);

    mapInstance.on("singleclick", (evt) => {
      let found = null;

      mapInstance.forEachFeatureAtPixel(evt.pixel, (feature) => {
        found = feature;
        if (!feature.get("layerName")) feature.set("layerName", "Couche");
        return true;
      });

      if (found) {
        const props = found.getProperties();
        setSelectedFeature({ ...props, layerName: props.layerName || "Calque" });

        highlightLayer.getSource().clear();
        highlightLayer.getSource().addFeature(found.clone());
        overlayLayer.setVisible(true);
      } else {
        setSelectedFeature(null);
        highlightLayer.getSource().clear();
        overlayLayer.setVisible(false);
      }
    });

    setLayers((prev) => ({ ...prev, highlight: highlightLayer, overlay: overlayLayer }));
    setMap(mapInstance);

    return () => mapInstance.setTarget(undefined);
  }, []);

  // =======================
  // LOAD STATIC GEOJSON (Regions/Communes)
  // =======================
  useEffect(() => {
    if (!map) return;

    let cancelled = false;

    const buildVectorLayer = (features, cfg) => {
      features.forEach((f) => f.set("layerName", cfg.name));

      const source = new VectorSource({ features });

      const layer = new VectorLayer({
        source,
        visible: !!visibleLayersRef.current[cfg.id],
        style: new Style({
          stroke: new Stroke({ color: cfg.color, width: cfg.width ?? 2 }),
          fill: cfg.fill ? new Fill({ color: cfg.fill }) : undefined,
        }),
      });

      return { layer, source };
    };

    (async () => {
      try {
        // Remove old static layers
        const oldRegions = staticLayersRef.current.Regions;
        const oldCommunes = staticLayersRef.current.Communes;
        if (oldRegions) map.removeLayer(oldRegions);
        if (oldCommunes) map.removeLayer(oldCommunes);

        const created = {};

        for (const cfg of layerConfigs) {
          try {
            const json = await fetchStaticGeoJSON(cfg.url);
            if (cancelled) return;

            const feats = new GeoJSON().readFeatures(json, {
              dataProjection: "EPSG:4326",
              featureProjection: "EPSG:3857",
            });

            const { layer, source } = buildVectorLayer(feats, cfg);

            map.addLayer(layer);
            created[cfg.id] = layer;

            // fit on regions
            if (cfg.id === "Regions") {
              const extent = source.getExtent();
              if (extent && extent.every(Number.isFinite)) {
                map.getView().fit(extent, {
                  padding: [50, 50, 50, 50],
                  maxZoom: 10,
                  duration: 500,
                });
              }
            }
          } catch (e) {
            // ✅ ne casse pas toute la carte si un fichier manque
            console.error(`Erreur chargement couche ${cfg.id}:`, e);
          }
        }

        staticLayersRef.current = {
          Regions: created.Regions ?? null,
          Communes: created.Communes ?? null,
        };

        setLayers((prev) => ({ ...prev, ...created }));
      } catch (e) {
        console.error("Erreur chargement couches statiques:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [map, layerConfigs]);

  // =======================
  // APPLY VISIBILITY
  // =======================
  useEffect(() => {
    layers.Regions?.setVisible(!!visibleLayers.Regions);
    layers.Communes?.setVisible(!!visibleLayers.Communes);
    layers.hopitaux?.setVisible(!!visibleLayers.hopitaux);
    layers.ecoles?.setVisible(!!visibleLayers.ecoles);
  }, [visibleLayers, layers]);

  // =======================
  // HOPITAUX
  // =======================
  useEffect(() => {
    if (!map || !hopitauxData) return;

    if (layers.hopitaux) map.removeLayer(layers.hopitaux);

    if (!hopitauxData?.features?.length) {
      console.warn("Hopitaux FeatureCollection vide:", hopitauxData);
      return;
    }

    const feats = new GeoJSON().readFeatures(hopitauxData, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });
    feats.forEach((f) => f.set("layerName", "Hôpitaux"));

    const source = new VectorSource({ features: feats });

    const layer = new VectorLayer({
      source,
      visible: !!visibleLayersRef.current.hopitaux,
      style: new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: "#00FF00" }),
          stroke: new Stroke({ color: "#000", width: 1 }),
        }),
      }),
    });

    map.addLayer(layer);
    setLayers((prev) => ({ ...prev, hopitaux: layer }));

    const extent = source.getExtent();
    if (extent && extent.every(Number.isFinite)) {
      map.getView().fit(extent, {
        padding: [50, 50, 50, 50],
        maxZoom: 14,
        duration: 700,
      });
    }
  }, [map, hopitauxData]); // eslint-disable-line react-hooks/exhaustive-deps

  // =======================
  // ECOLES
  // =======================
  useEffect(() => {
    if (!map || !ecolesData) return;

    if (layers.ecoles) map.removeLayer(layers.ecoles);

    if (!ecolesData?.features?.length) {
      console.warn("Ecoles FeatureCollection vide:", ecolesData);
      return;
    }

    const feats = new GeoJSON().readFeatures(ecolesData, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });
    feats.forEach((f) => f.set("layerName", "Écoles"));

    const source = new VectorSource({ features: feats });

    const layer = new VectorLayer({
      source,
      visible: !!visibleLayersRef.current.ecoles,
      style: new Style({
        stroke: new Stroke({ color: "#1D4ED8", width: 2 }),
        fill: new Fill({ color: "rgba(29,78,216,0.15)" }),
      }),
    });

    map.addLayer(layer);
    setLayers((prev) => ({ ...prev, ecoles: layer }));
  }, [map, ecolesData]); // eslint-disable-line react-hooks/exhaustive-deps

  // =======================
  // HELPERS
  // =======================
  const toggleLayer = (id) =>
    setVisibleLayers((prev) => ({ ...prev, [id]: !prev[id] }));

  const changeBaseMap = (type) => {
    if (!map) return;

    const sources = {
      googleS: new XYZ({ url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" }),
      googleM: new XYZ({ url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" }),
      googleT: new XYZ({ url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" }),
      osm: new OSM(),
    };

    map.getLayers().item(0).setSource(sources[type] ?? sources.osm);
    setBaseMapType(type);
  };

  const resetView = () => {
    map?.getView().animate({
      center: fromLonLat([-17.35, 14.76]),
      zoom: 12,
      duration: 800,
    });
  };

  return (
    <div className="max-w-[1800px] mx-auto mt-10 px-4 sm:px-0">
      <div className="border-2 rounded-xl p-4 sm:p-6 shadow-lg bg-white">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-60 p-4 bg-white rounded-lg shadow-md border border-gray-300 sticky top-4 h-fit">
            <h3 className="font-semibold mb-2">Légende</h3>

            <ul className="flex flex-col gap-2">
              {[
                { id: "Regions", name: "Régions", color: "#1E0F1C" },
                { id: "Communes", name: "Communes", color: "#A7001E" },
                { id: "hopitaux", name: "Hôpitaux", color: "#00FF00", type: "point" },
                { id: "ecoles", name: "Écoles", color: "#1D4ED8" },
              ].map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!visibleLayers[l.id]}
                    onChange={() => toggleLayer(l.id)}
                    className="w-4 h-4 rounded border-gray-400"
                  />
                  <div
                    className={l.type === "point" ? "w-3 h-3 rounded-full" : "w-5 h-0.5"}
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="text-sm">{l.name}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 text-xs text-gray-500 break-words">
              API: {API_BASE_URL || "(non défini en prod)"}
            </div>
          </div>

          <div className="flex-1 relative">
            <div
              ref={mapRef}
              className="w-full h-[700px] sm:h-[850px] rounded-lg border border-gray-400"
            />

            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
              <Recherche map={map} />
            </div>

            <Mesures map={map} />
            <Coordonnees map={map} />

            <div className="absolute bottom-4 left-4 z-50 flex flex-col gap-2">
              <div className="bg-white/90 backdrop-blur border border-gray-300 shadow rounded-lg p-2">
                <select
                  value={baseMapType}
                  onChange={(e) => changeBaseMap(e.target.value)}
                  className="border p-2 rounded-md shadow-sm bg-white w-full"
                >
                  <option value="osm">OpenStreetMap</option>
                  <option value="googleT">Google hybride</option>
                  <option value="googleS">Google Satellite</option>
                  <option value="googleM">Google Maps</option>
                </select>
              </div>
              <Echelle map={map} />
            </div>

            <div className="absolute top-4 right-4 z-50">
              <button
                className="bg-gray-200 text-gray-800 px-3 py-1 rounded-lg hover:bg-gray-300"
                onClick={resetView}
              >
                Zoom sur Dakar
              </button>
            </div>
          </div>

          <div className="w-80 flex flex-col gap-4">
            <Population selectedFeature={selectedFeature} />

            {map && layers.hopitaux && (
              <MapEditor
                map={map}
                editableLayer={layers.hopitaux}
                apiBaseUrl={`${API_BASE_URL}/api/hopitaux/`}
              />
            )}

            <RegionChart
              selectedRegion={selectedFeature?.nom || selectedFeature?.NOM || null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
