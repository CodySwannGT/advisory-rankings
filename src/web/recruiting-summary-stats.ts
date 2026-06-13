// Header summary stats for the Recruiting Market Map page.

import { fmtMoney } from "./app.js";
import { el } from "./design-system/index.js";
import { fmtNumber } from "./recruiting-sections.js";
import type { RecruitingMarketResponse } from "../harper/resource-recruiting-market-types.js";

/**
 * Builds value-first summary stat tiles and hides zero-value caveats.
 * @param data - RecruitingMarket response.
 * @returns Stat grid node.
 */
export function recruitingSummaryStatGrid(
  data: RecruitingMarketResponse
): HTMLElement {
  return el(
    "div",
    { class: "recruiting-stat-grid" },
    ...summaryStats(data).map(([label, value]) =>
      el(
        "div",
        { class: "recruiting-stat" },
        el("span", { class: "recruiting-stat-label" }, label),
        el("strong", {}, value)
      )
    )
  );
}

/**
 * Builds value-first header metrics and hides zero-value caveat tiles.
 * @param data - RecruitingMarket response.
 * @returns Header stat label/value pairs.
 */
function summaryStats(
  data: RecruitingMarketResponse
): readonly (readonly [string, string])[] {
  return [
    [
      "Activity",
      `${fmtNumber(data.summary.count)} moves · ${fmtMoney(data.summary.knownAum)} known AUM`,
    ],
    ...(data.summary.unknownAumCount > 0
      ? ([
          [
            "AUM coverage",
            `AUM unknown for ${fmtNumber(data.summary.unknownAumCount)} moves`,
          ],
        ] as const)
      : []),
    ...(data.summary.missingT12Count > 0
      ? ([
          [
            "T12 coverage",
            `T12 missing for ${fmtNumber(data.summary.missingT12Count)} moves`,
          ],
        ] as const)
      : []),
  ];
}
