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
import { getArea } from "ol/sphere";

import { getApiBaseUrl } from "../utils/api";

import Coordonnees from "./Coordonnees";
import MapEditor from "./MapEditor";
import RegionChart from "./RegionChart";
import Population from "./Population";
import Mesures from "./Mesures";
import Echelle from "./Echelle";
import Recherche from "./Recherche";

function withBase(path) {
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

function makeStyle(def) {
  if (def.kind === "point") {
    return new Style({
      image: new CircleStyle({
        radius: def.radius ?? 6,
        fill: new Fill({ color: def.pointFill ?? "#00FF00" }),
        stroke: new Stroke({
          color: def.pointStroke ?? "#000",
          width: def.pointStrokeWidth ?? 1,
        }),
      }),
    });
  }
  return new Style({
    stroke: new Stroke({ color: def.stroke ?? "#1D4ED8", width: def.width ?? 2 }),
    fill: def.fill ? new Fill({ color: def.fill }) : undefined,
  });
}

function buildVectorLayerFromFC(fc, def) {
  if (!fc?.features?.length) return null;

  const feats = new GeoJSON().readFeatures(fc, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });

  feats.forEach((f) => f.set("layerName", def.name));

  const source = new VectorSource({ features: feats });

  const layer = new VectorLayer({
    source,
    style: makeStyle(def),
  });

  layer.set("id", def.id);
  return { layer, source };
}

function removeLayerById(map, id) {
  const arr = map.getLayers().getArray();
  const toRemove = arr.filter((l) => l?.get?.("id") === id);
  toRemove.forEach((l) => map.removeLayer(l));
}

function areaKm2FromFeature3857(feature) {
  const geom = feature.getGeometry();
  if (!geom) return 0;
  const g = geom.clone().transform("EPSG:3857", "EPSG:4326");
  const m2 = getArea(g, { projection: "EPSG:4326" });
  return m2 / 1_000_000;
}

export default function Carte({ data }) {
  const API_BASE_URL = useMemo(() => getApiBaseUrl(), []);
  const mapRef = useRef(null);

  const [map, setMap] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [baseMapType, setBaseMapType] = useState("osm");

  // Fit une seule fois par couche
  const fittedRef = useRef(new Set());

  const LAYER_DEFS = useMemo(
    () => [
      {
        id: "Regions",
        name: "Régions",
        kind: "polygon",
        source: { type: "static", url: withBase("/donnees_shp/regions.geojson") },
        stroke: "#1E0F1C",
        width: 3,
        fill: "rgba(255,0,0,0)",
        visibleDefault: true,
        fitOnLoad: { maxZoom: 10, duration: 500 },
      },
      {
        id: "Communes",
        name: "Communes",
        kind: "polygon",
        source: { type: "static", url: withBase("/donnees_shp/communes.geojson") },
        stroke: "#A7001E",
        width: 1,
        fill: "rgba(255,0,0,0)",
        visibleDefault: true,
      },
      {
        id: "hopitaux",
        name: "Hôpitaux",
        kind: "point",
        source: { type: "data", key: "hopitaux" },
        pointFill: "#00FF00",
        visibleDefault: true,
        // ✅ important: fit sur les points importés
        fitOnLoad: { maxZoom: 12, duration: 500 },
      },
      {
        id: "ecoles",
        name: "Écoles",
        kind: "polygon",
        source: { type: "data", key: "ecoles" },
        stroke: "#1D4ED8",
        width: 2,
        fill: "rgba(29,78,216,0.15)",
        visibleDefault: false,
        // ✅ fit sur les polygones
        fitOnLoad: { maxZoom: 10, duration: 500 },
      },
    ],
    []
  );

  const [visibleLayers, setVisibleLayers] = useState(() => {
    const init = {};
    for (const d of LAYER_DEFS) init[d.id] = !!d.visibleDefault;
    return init;
  });

  const legendItems = useMemo(
    () =>
      LAYER_DEFS.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.kind === "point" ? "point" : "line",
        color: d.kind === "point" ? d.pointFill : d.stroke,
      })),
    [LAYER_DEFS]
  );

  // INIT MAP
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
    highlightLayer.set("id", "highlight");
    mapInstance.addLayer(highlightLayer);

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
      } else {
        setSelectedFeature(null);
        highlightLayer.getSource().clear();
      }
    });

    setMap(mapInstance);
    return () => mapInstance.setTarget(undefined);
  }, []);

  // LOAD / UPDATE layers : dépend seulement de map + data + defs
  useEffect(() => {
    if (!map) return;

    let cancelled = false;

    (async () => {
      for (const def of LAYER_DEFS) {
        try {
          removeLayerById(map, def.id);

          let fc = null;
          if (def.source.type === "static") {
            fc = await fetchStaticGeoJSON(def.source.url);
            if (cancelled) return;
          } else {
            fc = data?.[def.source.key] ?? null;
          }

          const built = buildVectorLayerFromFC(fc, def);
          if (!built) continue;

          map.addLayer(built.layer);

          // ✅ visibilité ici: mets l'état actuel si dispo sinon default
          const vis = (def.id in visibleLayers) ? !!visibleLayers[def.id] : !!def.visibleDefault;
          built.layer.setVisible(vis);

          // ✅ fit une seule fois (si couche visible)
          if (def.fitOnLoad && vis && !fittedRef.current.has(def.id)) {
            const extent = built.source.getExtent();
            if (extent && extent.every(Number.isFinite)) {
              map.getView().fit(extent, {
                padding: [50, 50, 50, 50],
                maxZoom: def.fitOnLoad.maxZoom ?? 14,
                duration: def.fitOnLoad.duration ?? 700,
              });
              fittedRef.current.add(def.id);
            }
          }
        } catch (e) {
          console.error(`Erreur chargement couche ${def.id}:`, e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [map, data, LAYER_DEFS]); // ✅ visibleLayers retiré

  // APPLY VISIBILITY only
  useEffect(() => {
    if (!map) return;
    map.getLayers().forEach((lyr) => {
      const id = lyr.get?.("id");
      if (!id) return;
      if (id in visibleLayers) lyr.setVisible(!!visibleLayers[id]);
    });
  }, [map, visibleLayers]);

  const regionsData = useMemo(() => {
    if (!map) return [];
    const regLayer = map.getLayers().getArray().find((l) => l.get?.("id") === "Regions");
    if (!regLayer) return [];
    const src = regLayer.getSource?.();
    if (!src) return [];

    return src.getFeatures().map((f) => {
      const p = f.getProperties?.() || {};
      const name = p.nom || p.NOM || p.name || p.NAME || "Région";
      const sup = Number(p.superficie || p.SUPERFICIE || p.area || 0) || areaKm2FromFeature3857(f);
      return { name, superficie: sup };
    });
  }, [map, data]);

  const hopLayer = useMemo(() => {
    if (!map) return null;
    return map.getLayers().getArray().find((l) => l.get?.("id") === "hopitaux") || null;
  }, [map, data]);

  const toggleLayer = (id) => setVisibleLayers((p) => ({ ...p, [id]: !p[id] }));

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
              {legendItems.map((l) => (
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

            {map && hopLayer && (
              <MapEditor
                map={map}
                editableLayer={hopLayer}
                apiBaseUrl={`${API_BASE_URL}/api/hopitaux/`}  // ✅ slash final
              />
            )}

            <RegionChart
              regionsData={regionsData}
              selectedRegion={selectedFeature?.nom || selectedFeature?.NOM || null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
