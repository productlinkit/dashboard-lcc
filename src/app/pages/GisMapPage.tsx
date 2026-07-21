import { LaosMap } from "../components/LaosMap";

export function GisMapPage() {
  return (
    <div className="max-w-screen-2xl mx-auto h-full flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-800">GIS Map</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Civil registration coverage across Laos provinces and the capital.
        </p>
      </div>

      {/* Map card takes whatever height is left in the viewport. */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex-1 min-h-0 flex flex-col">
        <div className="flex-shrink-0 mb-4">
          <h2 className="text-base font-semibold text-gray-800">Registrations by province</h2>
          <p className="text-sm text-gray-400">Hover a province for details · click to zoom</p>
        </div>
        <div className="flex-1 min-h-0">
          <LaosMap fill zoom={6} />
        </div>
      </div>
    </div>
  );
}
