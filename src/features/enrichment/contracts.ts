import type { EnrichmentTarget, ProposalField } from "./validation";

export type EnrichmentValue =
  | null
  | boolean
  | number
  | string
  | EnrichmentValue[]
  | { [key: string]: EnrichmentValue };
export type EnrichmentReceipt = {
  runId: string;
  suggestionIds: string[];
  changeIds: string[];
  revision: number;
};
export type EnrichmentTargetSummary = {
  target: EnrichmentTarget;
  label: string;
  revision: number;
  query: string;
};
export type EnrichmentReview = {
  companies: { id: string; name: string }[];
  id: string;
  target: EnrichmentTarget;
  label: string;
  baseRevision: number;
  currentRevision: number;
  runVersion: number;
  fetchStatus:
    "PENDING" | "RUNNING" | "NEEDS_SELECTION" | "COMPLETED" | "FAILED";
  failureCode: string | null;
  attemptCount: number;
  reviewToken: string | null;
  candidates: {
    externalId: string;
    name: string;
    classification: string;
    platforms: string[];
    year: number | null;
    description: string | null;
  }[];
  selectedCandidate: { externalId: string; name: string } | null;
  availableFields: ProposalField[];
  trailerChoices: { externalId: string; title: string | null }[];
  companyChoices: { externalId: string; name: string }[];
  suggestions: {
    id: string;
    fieldPath: ProposalField;
    current: EnrichmentValue;
    before: EnrichmentValue;
    proposed: EnrichmentValue;
    source: EnrichmentValue;
    confidence: null;
    manualReplacementRequired: boolean;
    status: "PENDING" | "ACCEPTED" | "REJECTED" | "CONFLICT";
  }[];
  unavailable: { field: string; reason: string }[];
  warnings: string[];
  stages: {
    name: string;
    status: "COMPLETED" | "SKIPPED";
    reason: string | null;
  }[];
  canAccept: boolean;
  canApply: boolean;
  receipt: EnrichmentReceipt | null;
};
