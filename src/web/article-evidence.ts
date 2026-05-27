// Article extracted-facts evidence helpers.
//
// Split out of `article.ts` so the page entry stays under the project's
// 300-line cap. The provenance compaction and table rendering are pure
// helpers with no design-system mount-time side effects.

import { humanize } from "./app.js";
import {
  SectionCardC,
  ScrollableTableC,
  elC,
} from "./design-system-adapters.js";

/** Provenance row after compaction into displayable field/value pairs. */
export interface EvidenceRow {
  readonly field: string;
  readonly value: string;
}

/** Accumulator used by `compactProvenance` to dedupe rows. */
interface EvidenceAccumulator {
  readonly keys: readonly string[];
  readonly rows: readonly EvidenceRow[];
}

/** Minimal provenance row shape consumed by `compactProvenance`. */
interface ProvenanceRowLike {
  readonly fieldName: string | undefined;
  readonly assertedValue: string | undefined;
  readonly quotePhrase: string | undefined;
}

/**
 * Builds the extracted-facts evidence section.
 * @param rows - Deduplicated provenance rows.
 * @returns Evidence card or null when no extracted facts exist.
 */
export function evidenceSection(
  rows: readonly EvidenceRow[]
): HTMLElement | null {
  return rows.length
    ? SectionCardC({
        title: `Extracted facts (${rows.length})`,
        body: ScrollableTableC(evidenceTable(rows)),
      })
    : null;
}

/**
 * Deduplicates extracted article facts by normalized field/value pairs.
 * @param rows - Provenance rows returned by ArticleView.
 * @returns Compact provenance rows for display.
 */
export function compactProvenance(
  rows: readonly unknown[]
): readonly EvidenceRow[] {
  const acc = rows.reduce<EvidenceAccumulator>(
    (current, raw) => {
      const row = toProvenanceRow(raw);
      const field = humanize(row.fieldName);
      const value = String(row.assertedValue || row.quotePhrase || "").trim();
      if (!field || !value) return current;
      const key = `${field.toLowerCase()}::${value.toLowerCase()}`;
      if (current.keys.includes(key)) return current;
      return {
        keys: [...current.keys, key],
        rows: [...current.rows, { field, value }],
      };
    },
    { keys: [], rows: [] }
  );
  return acc.rows;
}

/**
 * Renders extracted facts in a compact table.
 * @param rows - Deduplicated provenance rows.
 * @returns Table node wrapped by the evidence section.
 */
function evidenceTable(rows: readonly EvidenceRow[]): HTMLElement {
  return elC(
    "table",
    { class: "snap-table" },
    elC(
      "thead",
      {},
      elC("tr", {}, elC("th", {}, "Field"), elC("th", {}, "Value"))
    ),
    elC(
      "tbody",
      {},
      ...rows.map(row =>
        elC("tr", {}, elC("td", {}, row.field), elC("td", {}, row.value))
      )
    )
  );
}

/**
 * Narrows an unknown provenance entry to the fields we read for display.
 * @param raw - Raw row from the ArticleView response.
 * @returns Provenance row with only the fields we read, defaulted safely.
 */
function toProvenanceRow(raw: unknown): ProvenanceRowLike {
  if (typeof raw !== "object" || raw === null) {
    return {
      fieldName: undefined,
      assertedValue: undefined,
      quotePhrase: undefined,
    };
  }
  const row = raw as Readonly<Record<string, unknown>>;
  return {
    fieldName: typeof row.fieldName === "string" ? row.fieldName : undefined,
    assertedValue:
      typeof row.assertedValue === "string" ? row.assertedValue : undefined,
    quotePhrase:
      typeof row.quotePhrase === "string" ? row.quotePhrase : undefined,
  };
}
