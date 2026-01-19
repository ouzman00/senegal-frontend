import React, { useEffect, useMemo, useRef, useState } from "react";
import "ol/ol.css";
import { Map, View } from "ol";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat } from "ol/proj";
import { Style, Stroke, Fill, Circle as CircleStyle } from "ol/style";

import MapEditor from "./MapEditor";
import RegionChart from "./RegionChart";
import Population from "./Population";

export default function Carte({ hopitauxData, ecolesData }) {
  const mapRef = useRef(null);

  const [map, setMap] = useState(null);

  // références OL
  const [layers, setLayers] = useState({
    Regions: null,
    Communes: null,
    hopitaux: null,
    ecoles: null,
    highlight: null,
    overlay: null,
  });

  // visibilité UI
  const [visibleLayers, setVisibleLayers] = useState({
    Regions: true,
    Communes: false,
    hopitaux: true,
    ecoles: false,
  });

  const [baseMapType, setBaseMapType] = useState("osm");
  const [selectedFeature, setSelectedFeature] = useState(null);

  const layerConfigs = useMemo(
    () => [
      {
        id: "Regions",
        url: "/donnees_shp/Regions.geojson",
        color: "#1E0F1C",
        width: 3,
        fill: "rgba(255,0,0,0)",
        visible: true,
        name: "Régions",
      },
      {
        id: "Communes",
        url: "/donnees_shp/Communes.geojson",
        color: "#A7001E",
        width: 1,
        fill: "rgba(255,0,0,0)",
        visible: false,
        name: "Communes",
      },
      {
        id: "hopitaux",
        color: "#00FF00",
        visible: true,
        type: "point",
        name: "Hôpitaux",
      },
      {
        id: "ecoles",
        color: "#1D4ED8",
        visible: false,
        type: "polygon",
        name: "Écoles",
      },
    ],
    []
  );

  // ----------------- INIT MAP -----------------
  useEffect(() => {
    if (!mapRef.current) return;

    const osmLayer = new TileLayer({ source: new OSM() });

    const mapInstance = new Map({
      target: mapRef.current,
      layers: [osmLayer],
      view: new View({
        center: fromLonLat([-14.5, 14.5]),
        zoom: 8,
      }),
    });

    // Highlight layer
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

    // Overlay layer
    const overlayLayer = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        fill: new Fill({ color: "rgba(0,0,0,0.15)" }),
      }),
      visible: false,
    });
    mapInstance.addLayer(overlayLayer);

    // Couches statiques (celles qui ont une url)
    const createdLayers = {};

    layerConfigs
      .filter((c) => !!c.url)
      .forEach((config) => {
        const vectorSource = new VectorSource({
          url: config.url,
          format: new GeoJSON(),
        });

        vectorSource.on("addfeature", (evt) => {
          evt.feature.set("layerName", config.name);
        });

        const style = new Style({
          stroke: new Stroke({ color: config.color, width: config.width ?? 2 }),
          fill: config.fill ? new Fill({ color: config.fill }) : undefined,
        });

        const layer = new VectorLayer({
          source: vectorSource,
          visible: !!visibleLayers[config.id],
          style,
        });

        createdLayers[config.id] = layer;
        mapInstance.addLayer(layer);
      });

    // Click select
    mapInstance.on("singleclick", (evt) => {
      let found = null;

      mapInstance.forEachFeatureAtPixel(evt.pixel, (feature) => {
        found = feature;
        if (!feature.get("layerName")) feature.set("layerName", "Couche");
        return true;
      });

      if (found) {
        const props = found.getProperties();
        setSelectedFeature({
          ...props,
          layerName: props.layerName || "Calque",
        });

        highlightLayer.getSource().clear();
        highlightLayer.getSource().addFeature(found.clone());
        overlayLayer.setVisible(true);
      } else {
        setSelectedFeature(null);
        highlightLayer.getSource().clear();
        overlayLayer.setVisible(false);
      }
    });

    setLayers((prev) => ({
      ...prev,
      ...createdLayers,
      highlight: highlightLayer,
      overlay: overlayLayer,
    }));

    setMap(mapInstance);

    return () => mapInstance.setTarget(undefined);
  }, [layerConfigs]);

  // ----------------- APPLY VISIBILITY -----------------
  useEffect(() => {
    if (layers.Regions) layers.Regions.setVisible(!!visibleLayers.Regions);
    if (layers.Communes) layers.Communes.setVisible(!!visibleLayers.Communes);
    if (layers.hopitaux) layers.hopitaux.setVisible(!!visibleLayers.hopitaux);
    if (layers.ecoles) layers.ecoles.setVisible(!!visibleLayers.ecoles);
  }, [visibleLayers, layers]);

  // ----------------- HOPITAUX LAYER (POINTS) -----------------
  useEffect(() => {
    if (!map || !hopitauxData?.features) return;

    if (layers.hopitaux) map.removeLayer(layers.hopitaux);

    const feats = new GeoJSON().readFeatures(hopitauxData, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });

    if (!feats.length) {
      setLayers((prev) => ({ ...prev, hopitaux: null }));
      return;
    }

    feats.forEach((f) => f.set("layerName", "Hôpitaux"));

    const source = new VectorSource({ features: feats });

    const layer = new VectorLayer({
      source,
      visible: !!visibleLayers.hopitaux,
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
    if (extent && extent.every((v) => Number.isFinite(v))) {
      map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 16 });
    }
  }, [map, hopitauxData]);

  // ----------------- ECOLES LAYER (POLYGONS) -----------------
  useEffect(() => {
    if (!map || !ecolesData?.features) return;

    if (layers.ecoles) map.removeLayer(layers.ecoles);

    const feats = new GeoJSON().readFeatures(ecolesData, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });

    // Debug utile
    // console.log("Ecoles:", feats.length, feats[0]?.getGeometry()?.getType());

    if (!feats.length) {
      setLayers((prev) => ({ ...prev, ecoles: null }));
      return;
    }

    feats.forEach((f) => f.set("layerName", "Écoles"));

    const source = new VectorSource({ features: feats });

    const layer = new VectorLayer({
      source,
      visible: !!visibleLayers.ecoles,
      style: new Style({
        stroke: new Stroke({ color: "#1D4ED8", width: 2 }),
        fill: new Fill({ color: "rgba(29,78,216,0.15)" }),
      }),
    });

    map.addLayer(layer);
    setLayers((prev) => ({ ...prev, ecoles: layer }));
  }, [map, ecolesData]);

  // ----------------- HELPERS -----------------
  const toggleLayer = (id) => {
    setVisibleLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const changeBaseMap = (type) => {
    if (!map) return;

    const sources = {
      googleS: new XYZ({
        url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      }),
      googleM: new XYZ({
        url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
      }),
      googleT: new XYZ({
        url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
      }),
      osm: new OSM(),
    };

    map.getLayers().item(0).setSource(sources[type]);
    setBaseMapType(type);
  };

  const resetView = () => {
    map?.getView().animate({
      center: fromLonLat([-17.35, 14.76]),
      zoom: 12,
      duration: 1200,
    });
  };

  return (
    <div className="max-w-[1800px] mx-auto mt-10 px-4 sm:px-0">
      <div className="border-2 rounded-xl p-4 sm:p-6 shadow-lg bg-white">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* LEGEND */}
          <div className="w-60 p-4 bg-white rounded-lg shadow-md border border-gray-300 sticky top-4 h-fit">
            <h3 className="font-semibold mb-2">Légende</h3>
            <ul className="flex flex-col gap-2">
              {layerConfigs.map((l) => (
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
          </div>

          {/* MAP */}
          <div className="flex-1 relative">
            <div ref={mapRef} className="w-full h-[700px] sm:h-[850px] rounded-lg border border-gray-400" />

            <div className="absolute top-4 right-4 flex flex-col gap-2">
              <button
                className="bg-gray-200 text-gray-800 px-3 py-1 rounded-lg hover:bg-gray-300"
                onClick={resetView}
              >
                Zoom sur Dakar
              </button>
            </div>

            <div className="absolute bottom-4 left-4">
              <select
                value={baseMapType}
                onChange={(e) => changeBaseMap(e.target.value)}
                className="border p-2 rounded-md shadow-sm bg-white"
              >
                <option value="googleT">Google hybride</option>
                <option value="osm">OpenStreetMap</option>
                <option value="googleS">Google Satellite</option>
                <option value="googleM">Google Maps</option>
              </select>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="w-70 flex flex-col gap-4">
            <Population selectedFeature={selectedFeature} />

            <MapEditor
              map={map}
              editableLayer={layers.hopitaux}
              apiBaseUrl="http://127.0.0.1:8000/api/hopitaux/"
            />

            <RegionChart
              regionsData={[
                { name: "DAKAR", superficie: 547 },
                { name: "THIES", superficie: 6601 },
                { name: "SAINT LOUIS", superficie: 19107 },
                { name: "KAOLACK", superficie: 16010 },
                { name: "ZIGUINCHOR", superficie: 7339 },
                { name: "TAMBACOUNDA", superficie: 42364 },
                { name: "KOLDA", superficie: 13771 },
                { name: "MATAM", superficie: 29619 },
                { name: "FATICK", superficie: 6849 },
                { name: "KAFFRINE", superficie: 11262 },
                { name: "SEDHIOU", superficie: 7341 },
                { name: "KEDOUGOU", superficie: 16800 },
                { name: "DIOURBEL", superficie: 4824 },
                { name: "LOUGA", superficie: 29188 },
              ]}
              selectedRegion={selectedFeature?.nom || selectedFeature?.NOM || null}
            />

            {selectedFeature && (
              <div className="relative p-4 bg-white rounded-lg shadow-md border border-gray-300 max-h-[200px] overflow-auto">
                <button
                  onClick={() => {
                    setSelectedFeature(null);
                    layers.highlight?.getSource().clear();
                    layers.overlay?.setVisible(false);
                  }}
                  className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 font-bold"
                >
                  ×
                </button>

                <h3 className="font-semibold mb-2">Détails de l'entité</h3>
                <p className="italic text-sm mb-2">{selectedFeature.layerName}</p>

                <table className="text-sm w-full">
                  <tbody>
                    {Object.entries(selectedFeature)
                      .filter(([k]) => k !== "geometry")
                      .map(([key, value]) => (
                        <tr key={key}>
                          <td className="font-semibold pr-2">{key}</td>
                          <td>{String(value)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
