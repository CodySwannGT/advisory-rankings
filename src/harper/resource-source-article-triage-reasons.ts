import type { ArticleRow, FieldAssertionRow } from "../types/harper-schema.js";

/** Stable reason tokens used by source-article triage filters. */
export type SourceArticleTriageReason =
  | "uncategorized"
  | "no-event-cards"
  | "no-entity-chips"
  | "no-body-text"
  | "missing-provenance"
  | "candidate-only-provenance";

/** One public reason returned for a source-article triage row. */
export interface SourceArticleTriageReasonPayload {
  readonly token: SourceArticleTriageReason;
  readonly label: string;
}

/** Inputs needed to classify an article's observable extraction gaps. */
export interface SourceArticleTriageReasonInput {
  readonly article: Pick<ArticleRow, "category" | "bodyText">;
  readonly eventCardCount: number;
  readonly advisorCount: number;
  readonly firmCount: number;
  readonly teamCount: number;
  readonly provenanceRows: readonly Pick<FieldAssertionRow, "confidence">[];
}

/** Public triage metadata shared by future resource, UI, and tests. */
export interface SourceArticleTriageReasonSummary {
  readonly reasons: readonly SourceArticleTriageReasonPayload[];
  readonly reasonTokens: readonly SourceArticleTriageReason[];
  readonly candidateProvenanceCount: number;
  readonly provenanceCount: number;
  readonly hasBody: boolean;
  readonly entityCount: number;
}

const REASON_LABELS: Readonly<Record<SourceArticleTriageReason, string>> = {
  uncategorized: "Uncategorized",
  "no-event-cards": "No event cards",
  "no-entity-chips": "No entity chips",
  "no-body-text": "No body text",
  "missing-provenance": "Missing provenance",
  "candidate-only-provenance": "Candidate-only provenance",
};

/**
 * Computes stable source-article triage reasons from public extraction state.
 * @param input - Article metadata, hydrated counts, and provenance rows.
 * @returns Deterministic reason tokens, labels, and provenance metadata.
 */
export function sourceArticleTriageReasons(
  input: SourceArticleTriageReasonInput
): SourceArticleTriageReasonSummary {
  const entityCount = input.advisorCount + input.firmCount + input.teamCount;
  const provenanceCount = input.provenanceRows.length;
  const candidateProvenanceCount = input.provenanceRows.filter(
    isCandidateProvenance
  ).length;
  const hasBody = Boolean(input.article.bodyText?.trim());
  const candidates: readonly (SourceArticleTriageReason | null)[] = [
    isUncategorized(input.article.category) ? "uncategorized" : null,
    input.eventCardCount === 0 ? "no-event-cards" : null,
    entityCount === 0 ? "no-entity-chips" : null,
    hasBody ? null : "no-body-text",
    provenanceCount === 0 ? "missing-provenance" : null,
    provenanceCount > 0 && candidateProvenanceCount === provenanceCount
      ? "candidate-only-provenance"
      : null,
  ];
  const reasonTokens = candidates.filter(isReasonToken);
  return {
    reasons: reasonTokens.map(token => ({
      token,
      label: REASON_LABELS[token],
    })),
    reasonTokens,
    candidateProvenanceCount,
    provenanceCount,
    hasBody,
    entityCount,
  };
}

/**
 * Converts a triage reason token into public display copy.
 * @param reason - Stable triage reason token.
 * @returns Human-readable label.
 */
export function sourceArticleTriageReasonLabel(
  reason: SourceArticleTriageReason
): string {
  return REASON_LABELS[reason];
}

/**
 * Normalizes source category values before testing the uncategorized state.
 * @param category - Raw article category.
 * @returns True when the article lacks a meaningful category.
 */
function isUncategorized(category: string | null | undefined): boolean {
  const normalized = String(category ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, "_");
  return normalized === "" || normalized === "unknown";
}

/**
 * Mirrors ArticleView limitation copy: only `high` confidence is presented as
 * source-backed, so every other provenance row remains a candidate signal.
 * @param row - Public field-assertion row.
 * @returns True when the row is candidate, inferred, derived, or unscored.
 */
function isCandidateProvenance(
  row: Pick<FieldAssertionRow, "confidence">
): boolean {
  return String(row.confidence ?? "").toLowerCase() !== "high";
}

/**
 * Narrows nullable array entries to triage reason tokens.
 * @param reason - Candidate token.
 * @returns True when the value is a real triage reason.
 */
function isReasonToken(
  reason: SourceArticleTriageReason | null
): reason is SourceArticleTriageReason {
  return reason !== null;
}
