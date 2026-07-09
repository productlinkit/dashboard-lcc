/*
 * The six Phase-1 Civil Registration services (mirrors lcc-frontend).
 * Keys match the citizen app so application records line up across both apps.
 */
import {
  Home,
  Baby,
  Cross,
  Heart,
  HeartCrack,
  BookUser,
  type LucideIcon,
} from "lucide-react";

export interface ServiceDef {
  id: string;
  label: string;
  laLabel: string;
  short: string;
  icon: LucideIcon;
  color: string; // accent used for icon chips / charts
  fee: number; // LAK, 0 = free
}

export const SERVICES: ServiceDef[] = [
  { id: "resident", label: "Residence Certificate", laLabel: "ໃບຢັ້ງຢືນທີ່ຢູ່", short: "Residence", icon: Home, color: "#3752AE", fee: 20000 },
  { id: "birth", label: "Birth Declaration", laLabel: "ການແຈ້ງເກີດ", short: "Birth", icon: Baby, color: "#0EA5E9", fee: 0 },
  { id: "death", label: "Death Declaration", laLabel: "ການແຈ້ງເສຍຊີວິດ", short: "Death", icon: Cross, color: "#64748B", fee: 0 },
  { id: "marriage", label: "Marriage Certificate", laLabel: "ໃບຢັ້ງຢືນການແຕ່ງງານ", short: "Marriage", icon: Heart, color: "#EC4899", fee: 50000 },
  { id: "divorce", label: "Divorce Certificate", laLabel: "ໃບຢັ້ງຢືນການຢ່າຮ້າງ", short: "Divorce", icon: HeartCrack, color: "#F59E0B", fee: 50000 },
  { id: "family-book", label: "Family Book", laLabel: "ປຶ້ມສຳມະໂນຄົວ", short: "Family Book", icon: BookUser, color: "#10B981", fee: 0 },
];

export const SERVICE_BY_ID: Record<string, ServiceDef> = Object.fromEntries(
  SERVICES.map((s) => [s.id, s]),
);

export function formatLak(n: number): string {
  if (n === 0) return "Free";
  return `${n.toLocaleString("en-US")} LAK`;
}
