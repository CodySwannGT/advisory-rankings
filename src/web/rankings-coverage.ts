// Ranking data-quality renderers.

import type { HarperDate } from "../types/harper-schema.js";
import type {
  CoverageBucket,
  CoverageSampleRow,
  RankingsCoverage,
  SourceStatusBucket,
} from "../harper/resource-rankings-explorer-types.js";
import { fmtDate } from "./app-formatters.js";
import { el, EmptyText, SectionCard, Tag } from "./design-system/index.js";
import { fmtNumber, statusLabel } from "./rankings-sections.js";

const COVERAGE_BUCKET_LIMIT = 4;
const GAP_BUCKET_LIMIT = 6;

/**
 * Builds the rankings data-quality panel.
 * @param coverage - Rankings coverage payload.
 * @returns Data-quality panel card.
 */
export function coverageWorkbenchCard(
  coverage: RankingsCoverage | null | undefined
): HTMLElement {
  if (!coverage || coverage.emptyState) {
    return SectionCard({
      title: "Ranking data quality",
      attrs: { class: "rankings-coverage-workbench" },
      body: EmptyText({
        children:
          coverage?.emptyState ||
          "Ranking quality details are unavailable for this view.",
      }),
    });
  }

  return SectionCard({
    title: "Ranking data quality",
    attrs: { class: "rankings-coverage-workbench" },
    body: [
      coverageSummary(coverage),
      el(
        "div",
        { class: "rankings-coverage-layout" },
        coverageBucketPanel(coverage.buckets),
        gapBucketPanel(coverage.gapBuckets)
      ),
    ],
  });
}

/**
 * Builds the compact coverage KPI row.
 * @param coverage - Rankings coverage payload.
 * @returns KPI row.
 */
function coverageSummary(coverage: RankingsCoverage): HTMLElement {
  const latestLoadedAt = latestCoverageDate(coverage.buckets);
  return el(
    "div",
    { class: "rankings-coverage-summary" },
    coverageMetric(
      "Rankings in view",
      fmtNumber(coverage.totalEntries),
      "source-backed rows"
    ),
    coverageMetric(
      "Ranking lists",
      fmtNumber(coverage.buckets.length),
      "category/year groups"
    ),
    coverageMetric(
      "Open match issues",
      fmtNumber(coverage.gapBuckets.length),
      "profile or score gaps"
    ),
    coverageMetric("Latest import", displayDate(latestLoadedAt))
  );
}

/**
 * Builds a single coverage KPI.
 * @param label - KPI label.
 * @param value - KPI value.
 * @param hint - Optional explanatory text shown under the value.
 * @returns KPI node.
 */
function coverageMetric(
  label: string,
  value: string,
  hint: string | null = null
): HTMLElement {
  return el(
    "div",
    { class: "rankings-coverage-metric" },
    el("span", {}, label),
    el("strong", {}, value),
    hint ? el("small", {}, hint) : null
  );
}

/**
 * Builds category/year data-quality buckets.
 * @param buckets - Coverage buckets.
 * @returns Bucket panel.
 */
function coverageBucketPanel(
  buckets: readonly CoverageBucket[] = []
): HTMLElement {
  if (!buckets.length) {
    return coveragePanel(
      "Category coverage",
      EmptyText({ children: "No ranking-list coverage is loaded." })
    );
  }
  return coveragePanel(
    "Ranking-list coverage",
    el(
      "div",
      { class: "rankings-coverage-buckets" },
      ...buckets.slice(0, COVERAGE_BUCKET_LIMIT).map(coverageBucketCard)
    )
  );
}

/**
 * Builds one category/year data-quality bucket.
 * @param bucket - Coverage bucket.
 * @returns Bucket card node.
 */
function coverageBucketCard(bucket: CoverageBucket): HTMLElement {
  return el(
    "a",
    { class: "rankings-coverage-bucket", href: bucket.query },
    el(
      "div",
      { class: "rankings-coverage-bucket-head" },
      el(
        "strong",
        {},
        [bucket.category || "Unknown ranking", bucket.year]
          .filter(Boolean)
          .join(" ")
      ),
      el("span", {}, `${fmtNumber(bucket.total)} rankings`)
    ),
    bucketStatGrid([
      ["Matched", bucket.resolved],
      ["Needs match", bucket.unresolved],
      ["Firm gaps", bucket.missingFirm],
      ["Market gaps", bucket.missingMarket],
      ["Missing scores", bucket.missingScore],
    ]),
    el(
      "div",
      { class: "rankings-coverage-meta" },
      el("span", {}, `Latest import ${displayDate(bucket.latestLoadedAt)}`),
      sourceLabels(bucket.sourceLabels)
    ),
    sampleRows(bucket.sampleRows)
  );
}

/**
 * Builds source-status gap sample buckets.
 * @param buckets - Gap buckets.
 * @returns Gap panel.
 */
function gapBucketPanel(
  buckets: readonly SourceStatusBucket[] = []
): HTMLElement {
  if (!buckets.length) {
    return coveragePanel(
      "Profile and source issues",
      EmptyText({
        children: "No profile or source issues found in this view.",
      })
    );
  }
  return coveragePanel(
    "Profile and source issues",
    el(
      "div",
      { class: "rankings-gap-buckets" },
      ...buckets.slice(0, GAP_BUCKET_LIMIT).map(gapBucketCard)
    )
  );
}

/**
 * Builds one source-status gap row.
 * @param bucket - Gap bucket.
 * @returns Gap row node.
 */
function gapBucketCard(bucket: SourceStatusBucket): HTMLElement {
  return el(
    "a",
    { class: "rankings-gap-bucket", href: bucket.query },
    el(
      "div",
      { class: "rankings-gap-head" },
      statusTag(bucket.status),
      el("strong", {}, fmtNumber(bucket.count))
    ),
    sourceLabels(bucket.sourceLabels),
    sampleRows(bucket.sampleRows)
  );
}

/**
 * Wraps a data-quality panel section.
 * @param title - Panel title.
 * @param body - Panel body.
 * @returns Panel node.
 */
function coveragePanel(title: string, body: HTMLElement): HTMLElement {
  return el(
    "section",
    { class: "rankings-coverage-panel" },
    el("h3", {}, title),
    body
  );
}

/**
 * Builds a compact bucket stat grid.
 * @param pairs - Stat label/value pairs.
 * @returns Grid node.
 */
function bucketStatGrid(
  pairs: readonly (readonly [string, number])[]
): HTMLElement {
  return el(
    "div",
    { class: "rankings-bucket-stats" },
    ...pairs.map(([label, value]) =>
      el("span", {}, el("strong", {}, fmtNumber(value)), el("em", {}, label))
    )
  );
}

/**
 * Renders source labels as compact tags.
 * @param labels - Source labels.
 * @returns Source labels node.
 */
function sourceLabels(labels: readonly string[] = []): HTMLElement {
  if (!labels.length) {
    return el("span", { class: "muted" }, "Source name unavailable");
  }
  return el(
    "span",
    { class: "tag-list" },
    ...labels.slice(0, 2).map(label => Tag({ children: label }))
  );
}

/**
 * Renders sample ranking rows.
 * @param rows - Sample rows.
 * @returns Sample row list.
 */
function sampleRows(rows: readonly CoverageSampleRow[] = []): HTMLElement {
  if (!rows.length)
    return EmptyText({ children: "No sample rankings available." });
  return el(
    "ul",
    { class: "rankings-sample-rows" },
    ...rows.map(row =>
      el(
        "li",
        {},
        el("strong", {}, row.label || "Unknown row"),
        el(
          "span",
          {},
          [row.firmText, row.sourceLabel].filter(Boolean).join(" · ")
        )
      )
    )
  );
}

/**
 * Renders source and resolution status labels.
 * @param status - Source status string.
 * @returns Tag node.
 */
function statusTag(status: string): HTMLElement {
  const kind =
    status === "resolved" || status === "source-backed"
      ? "ok"
      : status === "unavailable" || status?.startsWith("missing")
        ? "warn"
        : "default";
  return Tag({
    kind,
    children: statusLabel(String(status || "unknown")),
  });
}

/**
 * Finds the newest loaded date across coverage buckets.
 * @param buckets - Coverage buckets.
 * @returns Latest date string.
 */
function latestCoverageDate(
  buckets: readonly CoverageBucket[] = []
): HarperDate | null {
  const dates = buckets
    .map(bucket => bucket.latestLoadedAt)
    .filter((value): value is HarperDate => Boolean(value))
    .sort((left, right) => String(right).localeCompare(String(left)));
  return dates[0] ?? null;
}

/**
 * Displays loaded dates without timestamp noise.
 * @param value - Loaded date value.
 * @returns Display date.
 */
function displayDate(value: HarperDate | null | undefined): string {
  if (!value) return "Unavailable";
  return fmtDate(value);
}
