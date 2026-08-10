import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { Map as LeafletMap, Layer, LeafletMouseEvent, PathOptions } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import { registry } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import type { MapProvince } from "../api/types";

/* Choropleth colour ramp (brand blue), low → high. Shaded by each province's
 * value relative to the busiest one, so any metric (registrations, population…)
 * spreads across the ramp. */
const COLORS = ["#EEF3FB", "#C7D3F0", "#9DB0E3", "#7189D3", "#4E68C0", "#3752AE", "#24357A"];

function shade(v: number, max: number): string {
  if (max <= 0 || v <= 0) return COLORS[0];
  const r = v / max;
  const idx = r >= 0.8 ? 6 : r >= 0.6 ? 5 : r >= 0.4 ? 4 : r >= 0.25 ? 3 : r >= 0.12 ? 2 : 1;
  return COLORS[idx];
}

const DEFAULT_CENTER: [number, number] = [18.2, 104.3];
const DEFAULT_ZOOM = 5;

export type MapMetric = "population" | "households" | "applications" | "issued" | "revenue";

/**
 * The province map endpoint answers with the rows plus the metric it applied;
 * older deployments answered with the bare array. Accept both.
 */
export function mapProvinceRows(payload: unknown): MapProvince[] {
  if (Array.isArray(payload)) return payload as MapProvince[];
  const rows = (payload as { rows?: unknown } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as MapProvince[]) : [];
}

/** geo_name → value, which is how a GeoJSON feature is matched to a row. */
export function mapValues(rows: MapProvince[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.geo_name || row.province] = row.value ?? 0;
  return out;
}

interface MapHover {
  name: string;
  value: number;
  x: number;
  y: number;
}

export interface LaosMapProps {
  fill?: boolean;
  zoom?: number;
  /** Metric to colour by (province → value). When omitted the map loads its own. */
  values?: Record<string, number>;
  /** Which server-side metric to load when `values` is not supplied. */
  metric?: MapMetric;
  valueLabel?: string;
  /** Controlled selection — when provided, selection is driven by the parent. */
  selected?: string | null;
  onSelect?: (name: string | null) => void;
  /** Hide the built-in province list (a parent may supply its own drill panel). */
  showList?: boolean;
}

export function LaosMap({
  fill = false,
  zoom = DEFAULT_ZOOM,
  values,
  metric = "applications",
  valueLabel = "Registrations",
  selected,
  onSelect,
  showList = true,
}: LaosMapProps = {}) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [internalActive, setInternalActive] = useState<string | null>(null);
  const [listHover, setListHover] = useState<string | null>(null);
  const [mapHover, setMapHover] = useState<MapHover | null>(null);
  const [error, setError] = useState(false);

  const mapRef = useRef<LeafletMap | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layersRef = useRef<Record<string, any>>({});

  // Only the uncontrolled-metric case fetches; a parent that passes `values`
  // already has the rows and does not need a second request.
  const provincesQuery = useQuery(
    (signal) => registry.mapProvinces({ metric }, signal),
    [metric],
    { enabled: values === undefined },
  );

  const controlled = onSelect !== undefined;
  const active = controlled ? selected ?? null : internalActive;
  const fetched = useMemo(() => mapValues(mapProvinceRows(provincesQuery.data)), [provincesQuery.data]);
  const vals = values ?? fetched;
  const maxVal = useMemo(() => Math.max(1, ...Object.values(vals)), [vals]);
  const list = useMemo(() => Object.entries(vals).sort((a, b) => b[1] - a[1]), [vals]);
  const valueOf = (name?: string) => (name && vals[name]) || 0;

  const focus = mapHover?.name ?? listHover ?? active;

  function styleFor(name: string, f: string | null): PathOptions {
    if (f && name !== f) {
      return { fillColor: "#D1D5DB", weight: 1, color: "#ffffff", opacity: 1, fillOpacity: 0.7 };
    }
    const highlighted = f === name;
    return {
      fillColor: shade(valueOf(name), maxVal),
      weight: highlighted ? 2.5 : 1,
      color: highlighted ? "#334155" : "#ffffff",
      opacity: 1,
      fillOpacity: highlighted ? 0.95 : 0.85,
    };
  }

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}laos-provinces.geojson`)
      .then((r) => {
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then((d: FeatureCollection) => setGeo(d))
      .catch(() => setError(true));
  }, []);

  // Repaint all regions whenever the focus or the metric changes.
  useEffect(() => {
    Object.entries(layersRef.current).forEach(([name, layer]) => layer.setStyle(styleFor(name, focus)));
    if (focus && layersRef.current[focus]) layersRef.current[focus].bringToFront();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, focus, maxVal, vals]);

  function setActive(name: string | null) {
    if (controlled) onSelect!(name);
    else setInternalActive(name);
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

  function onEachFeature(feature: Feature, layer: Layer) {
    const name = String(feature.properties?.name ?? "");
    layersRef.current[name] = layer;
    layer.on({
      mouseover: (e: LeafletMouseEvent) => setMapHover({ name, value: valueOf(name), x: e.containerPoint.x, y: e.containerPoint.y }),
      mousemove: (e: LeafletMouseEvent) => setMapHover({ name, value: valueOf(name), x: e.containerPoint.x, y: e.containerPoint.y }),
      mouseout: () => setMapHover(null),
      click: (e: LeafletMouseEvent) => {
        if (controlled) selectProvince(name);
        else mapRef.current?.fitBounds(e.target.getBounds(), { padding: [20, 20] });
      },
    });
  }

  if (error) {
    return (
      <div className={`${fill ? "h-full" : "h-[380px]"} flex items-center justify-center text-sm text-gray-400`}>
        Could not load the map data.
      </div>
    );
  }

  if (provincesQuery.error) {
    return (
      <div className={`${fill ? "h-full" : "h-[380px]"} flex flex-col items-center justify-center gap-3 text-center`}>
        <p className="text-sm text-gray-600">{provincesQuery.error.message}</p>
        <button
          onClick={provincesQuery.refetch}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
        >
          Retry
        </button>
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
        <MapContainer ref={mapRef} center={DEFAULT_CENTER} zoom={zoom} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
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

        {/* Legend: low → high */}
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur rounded-xl shadow-md border border-gray-100 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{valueLabel}</p>
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

      {/* Built-in province list (optional) */}
      {showList && (
        <div
          className={`lg:w-60 flex-shrink-0 border border-gray-100 rounded-xl flex flex-col ${
            fill ? "h-64 lg:h-auto lg:min-h-0" : ""
          }`}
          style={fill ? undefined : { height: 380 }}
        >
          <div className="px-3.5 py-2.5 border-b border-gray-100 flex items-center justify-between">
            {active ? (
              <button onClick={clearFilter} className="inline-flex items-center gap-1 text-xs font-medium text-[#3752AE] hover:underline">
                <X className="w-3.5 h-3.5" /> Clear filter
              </button>
            ) : (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Province</span>
            )}
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{valueLabel}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.map(([name, value]) => {
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
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: shade(value, maxVal) }} />
                    <span className={`truncate ${isActive ? "font-semibold text-[#3752AE]" : ""}`}>{name}</span>
                  </span>
                  <span className="text-gray-800 font-medium tabular-nums">{value.toLocaleString()}</span>
                </button>
              );
            })}
            {list.length === 0 && (
              <p className="px-3.5 py-8 text-center text-sm text-gray-400">
                {provincesQuery.loading ? "Loading…" : "No data for this metric."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
