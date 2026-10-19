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
export type EnrichmentReview = {
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
  candidates: { externalId: string; name: string; classification: string }[];
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
  stages: {
    name: string;
    status: "COMPLETED" | "SKIPPED";
    reason: string | null;
  }[];
  canApply: boolean;
  receipt: EnrichmentReceipt | null;
};
