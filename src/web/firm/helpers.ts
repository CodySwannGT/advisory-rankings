// Status, formatting, and layout helpers shared by the firm
// due-diligence section and the module cards. Extracted from
// `firm.ts` so each topic module stays under the max-lines limit.

import { fmtMoney, humanize } from "../app.js";
import { el } from "../design-system/index.js";
import {
  COPY_NEEDS_DATA,
  COPY_NOT_LOADED,
  COPY_SOURCE_BACKED,
  ModuleStatusHolder,
  STATUS_LOADED,
  STATUS_MISSING,
  TagComponent,
} from "./shared.js";

/**
 * Builds a compact keyboard-accessible explanation control.
 * @param label - Due-diligence term being explained.
 * @param explanation - Public explanation copy.
 * @returns Help text disclosure.
 */
export function helpText(label: string, explanation: string): HTMLElement {
  return el(
    "details",
    { class: "firm-dd-help" },
    el("summary", { "aria-label": `${label} explanation` }, "i"),
    el("p", {}, explanation)
  );
}

/**
 * Builds a title row with inline help content.
 * @param label - Section title.
 * @param explanation - Plain-language explanation.
 * @returns Heading content.
 */
export function sectionTitleWithHelp(
  label: string,
  explanation: string
): HTMLElement {
  return el(
    "span",
    { class: "firm-dd-title" },
    el("span", {}, label),
    helpText(label, explanation)
  );
}

/**
 * Renders a small metric tile.
 * @param label - Metric label.
 * @param value - Metric value.
 * @param sub - Optional supporting text.
 * @returns Metric tile node.
 */
export function metricTile(
  label: string,
  value: string | number | null | undefined,
  sub: string = ""
): HTMLElement {
  return el(
    "div",
    { class: "firm-dd-metric" },
    el("strong", {}, value ?? COPY_NOT_LOADED),
    el("span", {}, label),
    sub ? el("small", {}, sub) : null
  );
}

/**
 * Builds a status tag for a module status string.
 * @param status - Module status.
 * @returns Tag node.
 */
export function statusTag(status: string | null | undefined): HTMLElement {
  const group =
    status === STATUS_LOADED ? "ok" : status === "partial" ? "warn" : "default";
  return TagComponent({
    kind: group,
    children: statusCopy(status),
  });
}

/**
 * Converts internal status terms into reader-facing copy.
 * @param status - Raw module status.
 * @returns Public status label.
 */
export function statusCopy(status: string | null | undefined): string {
  switch (status) {
    case STATUS_LOADED:
      return COPY_SOURCE_BACKED;
    case "partial":
      return "Needs review";
    case "not_found":
    case "unavailable":
    case undefined:
    case null:
    case "":
      return COPY_NEEDS_DATA;
    default:
      return humanize(status) || status;
  }
}

/**
 * Returns the canonical status group for a due-diligence module.
 * @param module - Module payload.
 * @returns Loaded or missing literal.
 */
export function moduleStatusGroup(
  module: ModuleStatusHolder | null | undefined
): typeof STATUS_LOADED | typeof STATUS_MISSING {
  return module?.status === STATUS_LOADED ? STATUS_LOADED : STATUS_MISSING;
}

/**
 * Formats a count using locale-aware separators.
 * @param value - Raw numeric or string value.
 * @returns Formatted count string.
 */
export function fmtNumber(value: number | string | null | undefined): string {
  return value == null || value === "" ? "0" : Number(value).toLocaleString();
}

/**
 * Formats a signed integer.
 * @param value - Raw value.
 * @returns Signed integer string.
 */
export function signedNumber(value: number | null | undefined): string {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toLocaleString()}`;
}

/**
 * Formats a signed money amount.
 * @param value - Raw amount.
 * @returns Signed money string.
 */
export function signedMoney(value: number | null | undefined): string {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${fmtMoney(number)}`;
}
