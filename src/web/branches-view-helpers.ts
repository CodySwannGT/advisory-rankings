import { humanize } from "./app.js";
import { el } from "./design-system/index.js";
import { entityPath } from "./urls.js";
import {
  branchFilterLabel,
  hasActiveBranchFilters,
  type BranchFilterKey,
  type BranchFilters,
} from "./branches-url.js";
import type { BranchExplorerState } from "./branches.js";
import type { BranchDirectoryRow } from "../harper/resource-directory-types.js";

export const field = (
  label: string,
  name: BranchFilterKey,
  value: string,
  placeholder: string
): HTMLElement => {
  return el(
    "label",
    { class: "branches-filter-field" },
    el("span", {}, label),
    el("input", {
      name,
      value,
      placeholder,
      inputmode: name === "minAdvisorCount" ? "numeric" : undefined,
    })
  );
};

export const selectField = (
  label: string,
  name: BranchFilterKey,
  value: string,
  options: ReadonlyArray<Readonly<Record<"value" | "label", string>>>,
  emptyLabel: string
): HTMLElement => {
  return el(
    "label",
    { class: "branches-filter-field" },
    el("span", {}, label),
    el(
      "select",
      { name },
      el("option", { value: "", selected: value === "" }, emptyLabel),
      ...options.map(option =>
        el(
          "option",
          { value: option.value, selected: option.value === value },
          option.label
        )
      )
    )
  );
};

export const activeFilter = (
  key: BranchFilterKey,
  filters: BranchFilters
): HTMLElement => {
  return el(
    "p",
    { class: "branches-active-filter" },
    el("strong", {}, branchFilterLabel(key)),
    " ",
    filters[key]
  );
};

export const metric = (label: string, value: number | string): HTMLElement => {
  return el(
    "div",
    { class: "branches-metric" },
    el("span", { class: "branches-metric-label" }, label),
    el(
      "strong",
      { class: "branches-metric-value" },
      typeof value === "number" ? formatInteger(value) : value
    )
  );
};

export const rowField = (label: string, value: string): HTMLElement => {
  return el(
    "div",
    { class: "branches-row-field" },
    el("span", { class: "branches-row-label" }, label),
    el("span", { class: "branches-row-value" }, value)
  );
};

export const legendRow = (title: string, body: string): HTMLElement => {
  return el(
    "p",
    { class: "branches-legend-row" },
    el("strong", {}, title),
    " ",
    body
  );
};

export const emptyStateCopy = (
  state: BranchExplorerState
): Readonly<Record<"title" | "body", string>> => {
  if (hasActiveBranchFilters(state.filters)) {
    return {
      title: "No matching branches",
      body: "The current URL filters did not match public branch rows. Clear filters or broaden the firm, market, source, or advisor-count criteria.",
    };
  }
  return {
    title: "Branch data unavailable",
    body: "Public branch rows are not available from the current backend slice yet. This is different from a firm having no offices.",
  };
};

export const branchAnchor = (row: BranchDirectoryRow): string => {
  return row.firmId ? firmHref(row) : "#";
};

export const firmHref = (row: BranchDirectoryRow): string => {
  return entityPath("firm", {
    id: row.firmId,
    name: row.firmName ?? row.firmId,
  });
};

export const rowSubtitle = (row: BranchDirectoryRow): string => {
  return [row.firmName, locationLabel(row)].filter(Boolean).join(" · ");
};

export const locationLabel = (row: BranchDirectoryRow): string => {
  return [
    row.city,
    row.state,
    row.country && row.country !== "USA" ? row.country : null,
    row.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
};

export const coverageLabel = (row: BranchDirectoryRow): string => {
  if (row.coverageStatus === "loaded") return "Advisor links available";
  if (row.coverageStatus === "partial") return "Advisor links incomplete";
  return "Branch context unavailable";
};

export const gapGroupLabel = (row: BranchDirectoryRow): string => {
  const labels: Readonly<Record<BranchDirectoryRow["gapGroup"], string>> = {
    loaded: "Loaded branch coverage",
    partial: "Partial branch coverage",
    unavailable: "Unavailable branch context",
    "zero-advisor": "Zero linked advisors",
    "missing-source": "Missing public source",
  };
  return labels[row.gapGroup];
};

export const branchLevelLabel = (row: BranchDirectoryRow): string => {
  if (row.level === "market") return "Market-level aggregate";
  if (row.level === "complex") return "Regional complex";
  return "Branch office";
};

export const advisorCountLabel = (row: BranchDirectoryRow): string => {
  if (row.currentAdvisorCount > 0) {
    return `${formatInteger(row.currentAdvisorCount)} linked current advisors`;
  }
  if (row.level === "market") {
    return "No linked advisors in this market aggregate yet";
  }
  if (row.coverageStatus === "partial") {
    return "No linked advisors yet; coverage is still incomplete";
  }
  return "No linked current advisors";
};

export const branchCoverageContext = (row: BranchDirectoryRow): string => {
  const rowKind =
    row.level === "market"
      ? "This is a recruiting market aggregate, not one physical office."
      : `${branchLevelLabel(row)} row.`;
  if (row.coverageStatus === "loaded") {
    return `${rowKind} Advisor links are available for this row.`;
  }
  if (row.coverageStatus === "partial") {
    return `${rowKind} Some advisor links are still missing from public coverage.`;
  }
  return `${rowKind} Firm or advisor context could not be resolved from public data.`;
};

export const branchSourceContext = (row: BranchDirectoryRow): string => {
  const sources = row.sourceMetadata.sourceTypes.map(sourceContextLabel);
  if (!sources.length) {
    return "Source context: public source details are not available for this row.";
  }
  return `Source context: ${sources.join("; ")}.`;
};

const sourceContextLabel = (source: string): string => {
  const known = SOURCE_CONTEXT[source];
  if (known) return known;
  const label = humanize(source) ?? source;
  return `${label} public source`;
};

const SOURCE_CONTEXT: Readonly<Record<string, string>> = {
  brokercheck: "FINRA BrokerCheck registration data",
  edward_jones_advisor_results_api: "Edward Jones public advisor search",
  morgan_stanley_text: "Morgan Stanley public branch text",
  wells_fargo_locator: "Wells Fargo public branch locator",
};

export const coverageTagKind = (
  status: BranchDirectoryRow["coverageStatus"]
): string => {
  if (status === "loaded") return "ok";
  if (status === "partial") return "warn";
  return "danger";
};

export const coverageGapCount = (
  items: ReadonlyArray<BranchDirectoryRow>
): number => {
  return items.filter(row => row.coverageStatus !== "loaded").length;
};

export const sourceTypeCount = (
  items: ReadonlyArray<BranchDirectoryRow>
): number => {
  return new Set(items.flatMap(row => row.sourceMetadata.sourceTypes)).size;
};

export const formatInteger = (value: number): string => {
  return value.toLocaleString();
};
