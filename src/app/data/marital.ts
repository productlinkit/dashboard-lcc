/*
 * Marital status presentation metadata.
 *
 * The values are the register's own (`persons.marital`), so the API is the only
 * source of the numbers — this file just says how each one is labelled and
 * coloured. A record with the field left blank reads as single, which is what
 * the household forms mean by an empty box.
 */

export type MaritalStatus = "single" | "married" | "divorced" | "widowed";

export const MARITAL_META: Record<MaritalStatus, { label: string; color: string }> = {
  single: { label: "Single", color: "#3752AE" },
  married: { label: "Married", color: "#10B981" },
  divorced: { label: "Divorced", color: "#F59E0B" },
  widowed: { label: "Widowed", color: "#64748B" },
};

export const MARITAL_ORDER: MaritalStatus[] = ["single", "married", "divorced", "widowed"];

/** Narrows whatever the register returns to a status the page can render. */
export function maritalOf(value?: string | null): MaritalStatus {
  const key = (value ?? "").trim().toLowerCase();
  return key in MARITAL_META ? (key as MaritalStatus) : "single";
}

/** The label for one register value, or an em dash when nothing is recorded. */
export function maritalLabel(value?: string | null): string {
  if (!value?.trim()) return "—";
  return MARITAL_META[maritalOf(value)].label;
}
