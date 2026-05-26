// @ts-nocheck
// Rankings coverage workbench renderers.

import { el, EmptyText, SectionCard, Tag } from "./design-system/index.js";
import { fmtNumber } from "./rankings-sections.js";

const COVERAGE_BUCKET_LIMIT = 4;
const GAP_BUCKET_LIMIT = 6;

/**
 * Builds the rankings coverage workbench.
 * @param coverage - Rankings coverage payload.
 * @returns Coverage workbench card.
 */
export function coverageWorkbenchCard(coverage) {
  if (!coverage || coverage.emptyState) {
    return SectionCard({
      title: "Coverage workbench",
      attrs: { class: "rankings-coverage-workbench" },
      body: EmptyText({
        children:
          coverage?.emptyState ||
          "Coverage data is unavailable for this slice.",
      }),
    });
  }

  return SectionCard({
    title: "Coverage workbench",
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
function coverageSummary(coverage) {
  const latestLoadedAt = latestCoverageDate(coverage.buckets);
  return el(
    "div",
    { class: "rankings-coverage-summary" },
    coverageMetric("Rows in slice", fmtNumber(coverage.totalEntries)),
    coverageMetric("Buckets", fmtNumber(coverage.buckets.length)),
    coverageMetric("Gap types", fmtNumber(coverage.gapBuckets.length)),
    coverageMetric("Latest loaded", displayDate(latestLoadedAt))
  );
}

/**
 * Builds a single coverage KPI.
 * @param label - KPI label.
 * @param value - KPI value.
 * @returns KPI node.
 */
function coverageMetric(label, value) {
  return el(
    "div",
    { class: "rankings-coverage-metric" },
    el("span", {}, label),
    el("strong", {}, value)
  );
}

/**
 * Builds category/year coverage buckets.
 * @param buckets - Coverage buckets.
 * @returns Bucket panel.
 */
function coverageBucketPanel(buckets = []) {
  if (!buckets.length) {
    return coveragePanel(
      "Category coverage",
      EmptyText({ children: "No category/year coverage buckets loaded." })
    );
  }
  return coveragePanel(
    "Category coverage",
    el(
      "div",
      { class: "rankings-coverage-buckets" },
      ...buckets.slice(0, COVERAGE_BUCKET_LIMIT).map(coverageBucketCard)
    )
  );
}

/**
 * Builds one category/year coverage bucket.
 * @param bucket - Coverage bucket.
 * @returns Bucket card node.
 */
function coverageBucketCard(bucket) {
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
      el("span", {}, `${fmtNumber(bucket.total)} rows`)
    ),
    bucketStatGrid([
      ["Resolved", bucket.resolved],
      ["Unresolved", bucket.unresolved],
      ["Firm gaps", bucket.missingFirm],
      ["Market gaps", bucket.missingMarket],
      ["Score gaps", bucket.missingScore],
    ]),
    el(
      "div",
      { class: "rankings-coverage-meta" },
      el("span", {}, `Latest ${displayDate(bucket.latestLoadedAt)}`),
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
function gapBucketPanel(buckets = []) {
  if (!buckets.length) {
    return coveragePanel(
      "Source-status gaps",
      EmptyText({ children: "No source-status gaps found in this slice." })
    );
  }
  return coveragePanel(
    "Source-status gaps",
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
function gapBucketCard(bucket) {
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
 * Wraps a coverage workbench panel.
 * @param title - Panel title.
 * @param body - Panel body.
 * @returns Panel node.
 */
function coveragePanel(title, body) {
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
function bucketStatGrid(pairs) {
  return el(
    "div",
    { class: "rankings-bucket-stats" },
    ...pairs.map(([label, value]) =>
      el("span", {}, el("em", {}, label), el("strong", {}, fmtNumber(value)))
    )
  );
}

/**
 * Renders source labels as compact tags.
 * @param labels - Source labels.
 * @returns Source labels node.
 */
function sourceLabels(labels = []) {
  if (!labels.length) return el("span", { class: "muted" }, "No source label");
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
function sampleRows(rows = []) {
  if (!rows.length) return EmptyText({ children: "No sample rows available." });
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
function statusTag(status) {
  const kind =
    status === "resolved" || status === "source-backed"
      ? "ok"
      : status === "unavailable" || status?.startsWith("missing")
        ? "warn"
        : "default";
  return Tag({
    kind,
    children: String(status || "unknown")
      .replaceAll("-", " ")
      .toUpperCase(),
  });
}

/**
 * Finds the newest loaded date across coverage buckets.
 * @param buckets - Coverage buckets.
 * @returns Latest date string.
 */
function latestCoverageDate(buckets = []) {
  return buckets
    .map(bucket => bucket.latestLoadedAt)
    .filter(Boolean)
    .sort((left, right) => String(right).localeCompare(String(left)))[0];
}

/**
 * Displays loaded dates without timestamp noise.
 * @param value - Loaded date value.
 * @returns Display date.
 */
function displayDate(value) {
  if (!value) return "Unavailable";
  return String(value).slice(0, 10);
}
