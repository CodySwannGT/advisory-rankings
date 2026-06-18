import type {
  ArticleBodyPayload,
  ArticleEventCard,
  ArticleProvenancePayload,
  EntityChipPayload,
  EvidenceTableRow,
} from "./article-types.js";
import { SectionCard, el } from "./design-system/index.js";

/**
 * Public ArticleView resources used to explain incomplete evidence.
 */
export interface ArticleLimitationResources {
  readonly body: unknown;
  readonly eventCards: unknown;
  readonly events: readonly ArticleEventCard[];
  readonly firms: unknown;
  readonly firmRows: readonly EntityChipPayload[];
  readonly teams: unknown;
  readonly teamRows: readonly EntityChipPayload[];
  readonly advisors: unknown;
  readonly advisorRows: readonly EntityChipPayload[];
  readonly provenance: unknown;
  readonly provenanceRows: readonly ArticleProvenancePayload[];
  readonly evidenceRows: readonly EvidenceTableRow[];
}

/** Copy choices for one optional related-resource section. */
interface RowLimitationOptions {
  readonly rows: readonly unknown[];
  readonly raw: unknown;
  readonly empty: string;
  readonly failed: string;
}

/**
 * Builds public limitation copy for incomplete article evidence.
 * @param options - Public ArticleView resources and derived rows.
 * @returns Limitation section or null when the public payload is complete.
 */
export function limitationsSection(
  options: ArticleLimitationResources
): HTMLElement | null {
  const items = limitationItems(options);
  return items.length
    ? SectionCard({
        title: "Article evidence limitations",
        body: el(
          "ul",
          { class: "article-limitation-list" },
          ...items.map(item => el("li", {}, item))
        ),
      })
    : null;
}

/**
 * Describes incomplete article evidence without exposing private data.
 * @param options - Public ArticleView resources and derived rows.
 * @returns Limitation messages for anonymous readers.
 */
function limitationItems(
  options: ArticleLimitationResources
): readonly string[] {
  const gaps = [
    bodyLimitation(options.body),
    rowLimitation({
      rows: options.events,
      raw: options.eventCards,
      empty:
        "No structured event cards are available for this article; the story may still mention activity in prose.",
      failed:
        "Structured event cards could not load; the article remains available without implying complete event coverage.",
    }),
    rowLimitation({
      rows: options.firmRows,
      raw: options.firms,
      empty:
        "No public firm mentions are resolved for this article; unresolved names are not shown as confirmed profile links.",
      failed:
        "Mentioned firms could not load; unresolved firm evidence is withheld instead of guessed.",
    }),
    rowLimitation({
      rows: options.teamRows,
      raw: options.teams,
      empty:
        "No public team mentions are resolved for this article; team profile links may be unavailable.",
      failed:
        "Mentioned teams could not load; team evidence is omitted until the public resource is available.",
    }),
    rowLimitation({
      rows: options.advisorRows,
      raw: options.advisors,
      empty:
        "No public advisor mentions are resolved for this article; advisor profile links may be unavailable.",
      failed:
        "Mentioned advisors could not load; advisor evidence is omitted until the public resource is available.",
    }),
    provenanceLimitation(options.provenance, options.provenanceRows),
    options.provenanceRows.length && !options.evidenceRows.length
      ? "Extracted facts are present but lack public quote context, so they are not shown as source-backed facts."
      : null,
    hasHighConfidenceFact(options.provenanceRows)
      ? null
      : "No high-confidence source-backed facts are available; candidate extraction may be incomplete.",
  ].filter((item): item is string => Boolean(item));
  return gaps.length
    ? [
        ...gaps,
        "Public boundary: excludes watchlists, ratings, correction internals, analyst notes, and raw authenticated table data.",
      ]
    : gaps;
}

/**
 * Describes missing article body text.
 * @param body - Article body payload.
 * @returns Body limitation copy or null when text is present.
 */
function bodyLimitation(body: unknown): string | null {
  if (hasResourceError(body)) {
    return "Article body text could not load; use the original source link when available.";
  }
  return articleBodyText(body)
    ? null
    : "Stored article body text is unavailable; use the original source link when available.";
}

/**
 * Describes empty or failed public related-resource rows.
 * @param options - Resource rows, raw payload, and copy.
 * @param options.rows - Public rows available for display.
 * @param options.raw - Original ArticleView resource field.
 * @param options.empty - Copy used when the resource loaded with no rows.
 * @param options.failed - Copy used when the resource failed independently.
 * @returns Limitation copy or null when rows are available.
 */
function rowLimitation({
  rows,
  raw,
  empty,
  failed,
}: RowLimitationOptions): string | null {
  if (rows.length) return null;
  return hasResourceError(raw) ? failed : empty;
}

/**
 * Describes missing or failed public provenance rows.
 * @param raw - Raw provenance resource.
 * @param rows - Public provenance rows.
 * @returns Provenance limitation copy or null when rows are present.
 */
function provenanceLimitation(
  raw: unknown,
  rows: readonly ArticleProvenancePayload[]
): string | null {
  if (rows.length) return null;
  return hasResourceError(raw)
    ? "Source-backed facts could not load; AdvisorBook is not claiming complete extracted-fact coverage."
    : "No public source-backed facts are available for this article.";
}

/**
 * Reads stored body text from an ArticleView body payload.
 * @param body - Article body payload from ArticleView.
 * @returns Trimmed article body text or null.
 */
function articleBodyText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const text = (body as ArticleBodyPayload).text?.trim();
  return text || null;
}

/**
 * Checks whether a related-resource payload is an error envelope.
 * @param value - Resource field that may contain an error envelope.
 * @returns Whether the resource failed independently.
 */
function hasResourceError(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "error" in value);
}

/**
 * Checks whether at least one public provenance row is high confidence.
 * @param rows - Public provenance rows.
 * @returns Whether a high-confidence extracted fact exists.
 */
function hasHighConfidenceFact(
  rows: readonly ArticleProvenancePayload[]
): boolean {
  return rows.some(
    row => String(row.confidence ?? "").toLowerCase() === "high"
  );
}
