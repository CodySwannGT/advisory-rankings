import type {
  ArticleEventCard,
  ArticleMetadata,
  ArticleProvenancePayload,
  EntityChipPayload,
  EvidenceTableRow,
} from "./article-types.js";
import type { ArticleLimitationResources } from "./article-limitations.js";
import { humanize } from "./app.js";
import { el, SectionCard } from "./design-system/index.js";
import { entityPath } from "./urls.js";

/** Article evidence-map group input. */
interface EvidenceMapGroupOptions {
  readonly title: string;
  readonly count: number;
  readonly rows: readonly EvidenceMapRow[];
}

/** One article evidence-map row. */
interface EvidenceMapRow {
  readonly label: string;
  readonly detail: string;
  readonly href?: string;
}

/**
 * Builds a scan-friendly map from public article evidence already returned by
 * ArticleView.
 * @param article - Article metadata used for source and article links.
 * @param resources - Normalized public ArticleView rows.
 * @returns Evidence map section.
 */
export function articleEvidenceMap(
  article: ArticleMetadata,
  resources: ArticleLimitationResources
): HTMLElement {
  const nextSteps = nextStepRows(article, resources);
  return SectionCard({
    title: "Article evidence map",
    body: el(
      "div",
      { class: "article-evidence-map" },
      evidenceMapGroup({
        title: "Connected entities",
        count: connectedEntityCount(resources),
        rows: connectedEntityRows(resources),
      }),
      evidenceMapGroup({
        title: "Extracted facts",
        count: extractedFactCount(resources),
        rows: extractedFactRows(resources),
      }),
      evidenceMapGroup({
        title: "Event signals",
        count: resources.events.length,
        rows: eventSignalRows(resources),
      }),
      evidenceMapGroup({
        title: "Source status",
        count: sourceStatusCount(article, resources),
        rows: sourceStatusRows(article, resources),
      }),
      evidenceMapGroup({
        title: "Next steps",
        count: nextSteps.length,
        rows: nextSteps,
      })
    ),
  });
}

/**
 * Renders one evidence-map group.
 * @param options - Group label, count, and display rows.
 * @returns Evidence-map group node.
 */
function evidenceMapGroup(options: EvidenceMapGroupOptions): HTMLElement {
  return el(
    "section",
    { class: "article-evidence-map-group" },
    el(
      "div",
      { class: "article-evidence-map-group-head" },
      el("h3", {}, options.title),
      el("span", { class: "article-evidence-map-count" }, String(options.count))
    ),
    el(
      "ul",
      { class: "article-evidence-map-list" },
      ...options.rows.map(evidenceMapRow)
    )
  );
}

/**
 * Renders one evidence-map row.
 * @param row - Evidence-map row details.
 * @returns List item node.
 */
function evidenceMapRow(row: EvidenceMapRow): HTMLElement {
  const label = row.href
    ? el("a", { href: row.href }, row.label)
    : el("span", {}, row.label);
  return el(
    "li",
    { class: "article-evidence-map-row" },
    label,
    el("span", { class: "article-evidence-map-detail" }, row.detail)
  );
}

/**
 * Counts connected public entity rows.
 * @param resources - Article resource rows.
 * @returns Total connected entities.
 */
function connectedEntityCount(resources: ArticleLimitationResources): number {
  return (
    resources.firmRows.length +
    resources.teamRows.length +
    resources.advisorRows.length
  );
}

/**
 * Builds connected-entity rows with public profile destinations.
 * @param resources - Article resource rows.
 * @returns Connected entity evidence rows.
 */
function connectedEntityRows(
  resources: ArticleLimitationResources
): readonly EvidenceMapRow[] {
  const rows = [
    ...resources.firmRows.map(row => entityEvidenceRow("firm", row)),
    ...resources.teamRows.map(row => entityEvidenceRow("team", row)),
    ...resources.advisorRows.map(row => entityEvidenceRow("advisor", row)),
  ];
  return rows.length
    ? rows
    : [
        {
          label: "No connected profiles",
          detail:
            "ArticleView did not return public firm, team, or advisor entities.",
        },
      ];
}

/**
 * Builds one connected-entity evidence row.
 * @param kind - Public entity kind.
 * @param row - Entity chip payload.
 * @returns Evidence-map row.
 */
function entityEvidenceRow(
  kind: "firm" | "team" | "advisor",
  row: EntityChipPayload
): EvidenceMapRow {
  return {
    label: entityLabel(row),
    detail: `${humanize(kind)} profile link`,
    href: entityPath(kind, row),
  };
}

/**
 * Builds extracted-fact evidence rows.
 * @param resources - Article resource rows.
 * @returns Extracted fact rows.
 */
function extractedFactRows(
  resources: ArticleLimitationResources
): readonly EvidenceMapRow[] {
  if (resources.evidenceRows.length) {
    return resources.evidenceRows.slice(0, 4).map(evidenceFactRow);
  }
  if (resources.provenanceRows.length) {
    return resources.provenanceRows.flatMap(candidateProvenanceRow).slice(0, 4);
  }
  return [
    {
      label: "No public facts",
      detail: "ArticleView did not return field-level assertions.",
    },
  ];
}

/**
 * Builds a source-backed fact row.
 * @param row - Compact evidence row.
 * @returns Evidence map row.
 */
function evidenceFactRow(row: EvidenceTableRow): EvidenceMapRow {
  return {
    label: row.field,
    detail: row.value,
  };
}

/**
 * Counts map-level extracted facts, including candidate rows that lack broader
 * quote context.
 * @param resources - Article resource rows.
 * @returns Extracted fact count.
 */
function extractedFactCount(resources: ArticleLimitationResources): number {
  return resources.evidenceRows.length || resources.provenanceRows.length;
}

/**
 * Converts a provenance row into candidate fact copy when the facts table omits
 * it for missing broader quote context.
 * @param row - Article provenance row.
 * @returns Candidate fact row, or empty when no value is public.
 */
function candidateProvenanceRow(
  row: ArticleProvenancePayload
): readonly EvidenceMapRow[] {
  const value = scalar(row.assertedValue);
  if (!value) return [];
  const field = publicFactLabel(row.fieldName);
  const confidence = humanize(row.confidence) || "Candidate";
  return [
    {
      label: field ? `${value} (${field})` : value,
      detail: `${confidence} extraction; broader source context is unavailable.`,
    },
  ];
}

/**
 * Builds event-signal rows.
 * @param resources - Article resource rows.
 * @returns Event signal rows.
 */
function eventSignalRows(
  resources: ArticleLimitationResources
): readonly EvidenceMapRow[] {
  return resources.events.length
    ? resources.events.map((event, index) => ({
        label: eventSignalLabel(event, index),
        detail: "Public event card generated from article data.",
      }))
    : [
        {
          label: "No event card",
          detail:
            "No transition or disclosure signal was generated for this article.",
        },
      ];
}

/**
 * Builds source-status rows.
 * @param article - Article metadata.
 * @param resources - Article resource rows.
 * @returns Source status rows.
 */
function sourceStatusRows(
  article: ArticleMetadata,
  resources: ArticleLimitationResources
): readonly EvidenceMapRow[] {
  return [
    {
      label: "Original source",
      detail: article.url
        ? "Outbound article source link is available."
        : "No outbound source URL is available.",
      href: article.url || undefined,
    },
    {
      label: "Stored body",
      detail: hasArticleBody(resources.body)
        ? "Stored article body text is available."
        : "Stored article body text is unavailable.",
    },
    {
      label: "Provenance rows",
      detail: `${resources.provenanceRows.length} raw row${
        resources.provenanceRows.length === 1 ? "" : "s"
      }, ${resources.evidenceRows.length} public fact${
        resources.evidenceRows.length === 1 ? "" : "s"
      }.`,
    },
  ];
}

/**
 * Counts positive source-status signals.
 * @param article - Article metadata.
 * @param resources - Article resource rows.
 * @returns Count of available source signals.
 */
function sourceStatusCount(
  article: ArticleMetadata,
  resources: ArticleLimitationResources
): number {
  return [
    Boolean(article.url),
    hasArticleBody(resources.body),
    resources.provenanceRows.length > 0,
  ].filter(Boolean).length;
}

/**
 * Builds public next-step rows.
 * @param article - Article metadata.
 * @param resources - Article resource rows.
 * @returns Next-step link rows.
 */
function nextStepRows(
  article: ArticleMetadata,
  resources: ArticleLimitationResources
): readonly EvidenceMapRow[] {
  const firstProfiles = [
    firstProfileStep("firm", resources.firmRows),
    firstProfileStep("team", resources.teamRows),
    firstProfileStep("advisor", resources.advisorRows),
  ].filter((row): row is EvidenceMapRow => row !== null);
  return [
    ...firstProfiles,
    ...(article.url
      ? [
          {
            label: "Open original article",
            detail: "Review the publisher source for full context.",
            href: article.url,
          },
        ]
      : []),
  ];
}

/**
 * Builds the first available profile next step for an entity kind.
 * @param kind - Public entity kind.
 * @param rows - Entity chip payloads.
 * @returns Next-step row or null.
 */
function firstProfileStep(
  kind: "firm" | "team" | "advisor",
  rows: readonly EntityChipPayload[]
): EvidenceMapRow | null {
  const row = rows[0];
  return row
    ? {
        label: `Open ${humanize(kind)} profile`,
        detail: entityLabel(row),
        href: entityPath(kind, row),
      }
    : null;
}

/**
 * Reads a public display label from an entity chip payload.
 * @param row - Entity chip payload.
 * @returns Display label.
 */
function entityLabel(row: EntityChipPayload): string {
  return (
    scalar(row.short) ||
    scalar(row.name) ||
    scalar(row.displayName) ||
    scalar(row.legalName) ||
    scalar(row.id) ||
    "Unknown entity"
  );
}

/**
 * Formats an event signal label.
 * @param event - Article event card payload.
 * @param index - Event index.
 * @returns Event signal label.
 */
function eventSignalLabel(event: ArticleEventCard, index: number): string {
  return `${humanize(event.kind) || "Event"} ${index + 1}`;
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
  if (
    raw === "money_mention" ||
    raw === "money mention" ||
    raw === "moneymention"
  ) {
    return "Reported amount";
  }
  return humanize(fieldName) || null;
}

/**
 * Checks whether an ArticleView body payload includes visible body text.
 * @param body - Raw body resource.
 * @returns Whether stored body content exists.
 */
function hasArticleBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as Readonly<Record<string, unknown>>;
  return Boolean(scalar(record.text) || scalar(record.html));
}

/**
 * Converts scalar-ish values to trimmed strings.
 * @param value - Unknown payload value.
 * @returns Trimmed string or null.
 */
function scalar(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text || null;
}
