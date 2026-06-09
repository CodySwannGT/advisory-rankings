// Top-firm rail renderer for the public Interactive Rankings Explorer.

import {
  el,
  EntityList,
  EntityRow,
  Heading,
  SectionCard,
} from "./design-system/index.js";
import { fmtNumber } from "./rankings-sections.js";
import type { TopFirmRow } from "../harper/resource-rankings-explorer-types.js";

const TOP_FIRM_LIMIT = 6;

/**
 * Builds the top firms rail card.
 * @param rows - Top firm aggregate rows.
 * @returns Rail card with explicit firm labels and count units.
 */
export function topFirmsCard(rows: readonly TopFirmRow[]): HTMLElement {
  const visibleRows = rows.slice(0, TOP_FIRM_LIMIT);
  if (!visibleRows.length) return el("div");
  return SectionCard({
    attrs: { class: "rankings-top-firms" },
    body: [
      Heading({
        level: 3,
        attrs: { class: "card-subtitle" },
        children: "Top firms",
      }),
      EntityList({
        rows: visibleRows.map(row =>
          EntityRow({
            avatar: "Firm",
            name: row.firm?.name || row.firmText || "Unknown firm",
            sub: topFirmSubLabel(row),
            tail: el(
              "span",
              { class: "rankings-firm-count" },
              rankingCountLabel(row.count)
            ),
            href: row.firm?.url,
          })
        ),
      }),
    ],
  });
}

/**
 * Builds the explanatory sub-line for a top-firm row.
 * @param row - Firm aggregate row from the rankings explorer payload.
 * @returns Human-readable row context.
 */
function topFirmSubLabel(row: TopFirmRow): string {
  const matchLabel = row.firm?.id
    ? "Matched AdvisorBook firm"
    : "Source firm name awaiting match";
  return `${matchLabel} across ${rankingCountLabel(row.count)}`;
}

/**
 * Formats a ranking count with its unit.
 * @param count - Number of ranking appearances.
 * @returns Count label.
 */
function rankingCountLabel(count: number): string {
  return `${fmtNumber(count)} ${count === 1 ? "ranking" : "rankings"}`;
}
