import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON, Layer, LeafletMouseEvent, PathOptions } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import { PROVINCE_STATS } from "../data/mockData";

/* Choropleth colour ramp (brand blue), low → high. */
const GRADES = [0, 100, 250, 500, 750, 1000, 1500];
const COLORS = ["#EEF3FB", "#C7D3F0", "#9DB0E3", "#7189D3", "#4E68C0", "#3752AE", "#24357A"];

function getColor(d: number): string {
  for (let i = GRADES.length - 1; i >= 0; i--) {
    if (d >= GRADES[i]) return COLORS[i];
  }
  return COLORS[0];
}

function valueOf(name?: string): number {
  return (name && PROVINCE_STATS[name]) || 0;
}

const PROVINCE_LIST = Object.entries(PROVINCE_STATS).sort((a, b) => b[1] - a[1]);

const DEFAULT_CENTER: [number, number] = [18.2, 104.3];
const DEFAULT_ZOOM = 5;

interface MapHover {
  name: string;
  value: number;
  x: number;
  y: number;
}

/* Style for a province given the currently focused province (null = none). */
function styleFor(name: string, focus: string | null): PathOptions {
  if (focus && name !== focus) {
    return { fillColor: "#D1D5DB", weight: 1, color: "#ffffff", opacity: 1, fillOpacity: 0.7 };
  }
  const highlighted = focus === name;
  return {
    fillColor: getColor(valueOf(name)),
    weight: highlighted ? 2.5 : 1,
    color: highlighted ? "#334155" : "#ffffff",
    opacity: 1,
    fillOpacity: highlighted ? 0.95 : 0.85,
  };
}

/* `fill` makes the map stretch to its container instead of the fixed 380px card
 * height — used by the dedicated GIS Map page. */
export function LaosMap({ fill = false, zoom = DEFAULT_ZOOM }: { fill?: boolean; zoom?: number } = {}) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [listHover, setListHover] = useState<string | null>(null);
  const [mapHover, setMapHover] = useState<MapHover | null>(null);
  const [error, setError] = useState(false);

  const mapRef = useRef<LeafletMap | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layersRef = useRef<Record<string, any>>({});

  const focus = mapHover?.name ?? listHover ?? active;

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}laos-provinces.geojson`)
      .then((r) => {
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then((d: FeatureCollection) => setGeo(d))
      .catch(() => setError(true));
  }, []);

  // Repaint all regions whenever the focused province changes.
  useEffect(() => {
    Object.entries(layersRef.current).forEach(([name, layer]) => layer.setStyle(styleFor(name, focus)));
    if (focus && layersRef.current[focus]) layersRef.current[focus].bringToFront();
  }, [geo, focus]);

  function onEachFeature(feature: Feature, layer: Layer) {
    const name = String(feature.properties?.name ?? "");
    layersRef.current[name] = layer;
    layer.on({
      mouseover: (e: LeafletMouseEvent) => {
        setMapHover({ name, value: valueOf(name), x: e.containerPoint.x, y: e.containerPoint.y });
      },
      mousemove: (e: LeafletMouseEvent) => {
        setMapHover({ name, value: valueOf(name), x: e.containerPoint.x, y: e.containerPoint.y });
      },
      mouseout: () => {
        setMapHover(null);
      },
      click: (e: LeafletMouseEvent) => {
        mapRef.current?.fitBounds(e.target.getBounds(), { padding: [20, 20] });
      },
    });
  }

  function clearFilter() {
    setActive(null);
    mapRef.current?.setView(DEFAULT_CENTER, zoom);
  }

  function selectProvince(name: string) {
    if (active === name) {
      clearFilter();
      return;
    }
    setActive(name);
    const layer = layersRef.current[name];
    if (layer) mapRef.current?.fitBounds(layer.getBounds(), { padding: [20, 20] });
  }

  if (error) {
    return (
      <div className={`${fill ? "h-full" : "h-[380px]"} flex items-center justify-center text-sm text-gray-400`}>
        Could not load the map data.
      </div>
    );
  }

  return (
    <div className={`flex flex-col lg:flex-row gap-4 ${fill ? "h-full min-h-0" : ""}`}>
      {/* Map */}
      <div
        className={`relative flex-1 rounded-xl overflow-hidden border border-gray-100 ${fill ? "min-h-0" : ""}`}
        style={fill ? undefined : { height: 380 }}
      >
        <MapContainer
          ref={mapRef}
          center={DEFAULT_CENTER}
          zoom={zoom}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {geo && <GeoJSON data={geo} style={(f) => styleFor(String(f?.properties?.name ?? ""), null)} onEachFeature={onEachFeature} />}
        </MapContainer>

        {/* Cursor-following tooltip */}
        {mapHover && (
          <div
            className="absolute z-[1000] pointer-events-none bg-white/95 backdrop-blur rounded-lg shadow-md border border-gray-100 px-2.5 py-1.5 text-xs whitespace-nowrap"
            style={{ left: mapHover.x + 14, top: mapHover.y + 14 }}
          >
            <span className="font-semibold text-gray-800">{mapHover.name}</span>
            <span className="text-gray-400"> · </span>
            <span className="text-gray-700">{mapHover.value.toLocaleString()}</span>
          </div>
        )}

        {/* Legend: low → high, no numbers */}
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur rounded-xl shadow-md border border-gray-100 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span>Low</span>
            <div className="flex overflow-hidden rounded-full">
              {COLORS.map((c) => (
                <span key={c} className="w-5 h-3" style={{ backgroundColor: c }} />
              ))}
            </div>
            <span>High</span>
          </div>
        </div>
      </div>

      {/* Province list */}
      <div
        className={`lg:w-60 flex-shrink-0 border border-gray-100 rounded-xl flex flex-col ${
          fill ? "h-64 lg:h-auto lg:min-h-0" : ""
        }`}
        style={fill ? undefined : { height: 380 }}
      >
        <div className="px-3.5 py-2.5 border-b border-gray-100 flex items-center justify-between">
          {active ? (
            <button
              onClick={clearFilter}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#3752AE] hover:underline"
            >
              <X className="w-3.5 h-3.5" /> Clear filter
            </button>
          ) : (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Province</span>
          )}
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Registrations</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {PROVINCE_LIST.map(([name, value]) => {
            const isActive = active === name;
            return (
              <button
                key={name}
                onMouseEnter={() => setListHover(name)}
                onMouseLeave={() => setListHover(null)}
                onClick={() => selectProvince(name)}
                className={`w-full flex items-center justify-between px-3.5 py-2 text-sm border-b border-gray-50 last:border-0 transition-colors ${
                  isActive ? "bg-[#3752AE]/10" : "hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2 text-gray-700 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: getColor(value) }} />
                  <span className={`truncate ${isActive ? "font-semibold text-[#3752AE]" : ""}`}>{name}</span>
                </span>
                <span className="text-gray-800 font-medium tabular-nums">{value.toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
