import { Construction } from "lucide-react";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#344EAD]/10 flex items-center justify-center mb-4">
          <Construction className="w-7 h-7 text-[#344EAD]" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        <p className="text-sm text-gray-400 mt-1 max-w-md">{description}</p>
      </div>
    </div>
  );
}
