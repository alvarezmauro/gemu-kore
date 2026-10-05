export const defectSeverities = [
  "COSMETIC",
  "MINOR",
  "MAJOR",
  "CRITICAL",
] as const;
export const defectStatuses = ["ACTIVE", "REPAIRED", "ACCEPTED"] as const;
export type DefectSeverity = (typeof defectSeverities)[number];
export type DefectStatus = (typeof defectStatuses)[number];
export const severityLabels: Record<DefectSeverity, string> = {
  COSMETIC: "Cosmetic",
  MINOR: "Minor",
  MAJOR: "Major",
  CRITICAL: "Critical",
};
export const statusLabels: Record<DefectStatus, string> = {
  ACTIVE: "Active",
  REPAIRED: "Repaired",
  ACCEPTED: "Accepted",
};
export type DefectSummary = {
  id: string;
  collectionItemId: string;
  title: string;
  description: string | null;
  severity: DefectSeverity;
  status: DefectStatus;
  resolvedAt: string | null;
  repairNote: string | null;
  createdAt: string;
  updatedAt: string;
};
export type DefectItemOption = { id: string; label: string };
export type DefectItem = DefectItemOption & { revision: number };
export type DefectActionResult = {
  status: "success" | "error";
  message: string;
};
export function defectCounts(defects: readonly DefectSummary[]) {
  const active = defects.filter((defect) => defect.status === "ACTIVE").length;
  const accepted = defects.filter(
    (defect) => defect.status === "ACCEPTED",
  ).length;
  const repaired = defects.filter(
    (defect) => defect.status === "REPAIRED",
  ).length;
  return { active, accepted, repaired, unresolved: active + accepted };
}
