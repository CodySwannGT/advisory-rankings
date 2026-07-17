import type {
  ArticleProvenancePayload,
  CompactProvenanceAccumulator,
  EvidenceTableRow,
} from "./article-types.js";
import { humanize } from "./app.js";

/**
 * Deduplicates extracted article facts by normalized field/value pairs.
 * @param rows - Provenance rows returned by ArticleView.
 * @returns Compact provenance rows for display.
 */
export function compactProvenance(
  rows: readonly ArticleProvenancePayload[]
): readonly EvidenceTableRow[] {
  return rows.reduce(
    (acc: CompactProvenanceAccumulator, row) => {
      const fact = humanFacingFact(row);
      const context = sourceContext(row);
      if (!fact || !context) return acc;
      const value = `${context}`;
      const field = fact;
      const key = `${field.toLowerCase()}::${value.toLowerCase()}`;
      if (acc.keys.includes(key)) return acc;
      return {
        keys: [...acc.keys, key],
        rows: [...acc.rows, { field, value }],
      };
    },
    { keys: [], rows: [] }
  ).rows;
}

/**
 * Builds a public fact label from the asserted value and field.
 * @param row - Provenance row returned by ArticleView.
 * @returns Human-facing fact summary or null when no value exists.
 */
function humanFacingFact(row: ArticleProvenancePayload): string | null {
  const value = String(row.assertedValue ?? "").trim();
  if (!value) return null;
  const field = publicFactLabel(row.fieldName);
  return field ? `${value} (${field})` : value;
}

/**
 * Maps raw extraction fields to public article labels.
 * @param fieldName - Raw provenance field name.
 * @returns Product-language label.
 */
function publicFactLabel(fieldName: unknown): string | null {
  const raw = String(fieldName ?? "")
    .trim()
    .toLowerCase();
  if (raw === "money_mention" || raw === "money mention") {
    return "Reported amount";
  }
  return humanize(fieldName) || null;
}

/**
 * Extracts source context that explains what a fact refers to.
 * @param row - Provenance row returned by ArticleView.
 * @returns Source phrase when it adds context beyond the raw value.
 */
function sourceContext(row: ArticleProvenancePayload): string | null {
  const value = String(row.assertedValue ?? "").trim();
  const quote = String(row.quotePhrase ?? "").trim();
  if (!quote || quote.toLowerCase() === value.toLowerCase()) return null;
  return quote;
}
