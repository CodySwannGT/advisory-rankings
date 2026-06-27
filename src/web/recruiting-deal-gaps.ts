import type {
  DealGapResponse,
  DealGapRow,
} from "../harper/resource-recruiting-deal-data-gaps.js";

import { api, refreshMe, logout, search } from "./app.js";
import {
  clearC,
  elC,
  EmptyCardC,
  MountThreeColumnPage,
  SectionCardC,
  SkeletonCardC,
  type ThreeColumnLayout,
} from "./recruiting-types.js";
import {
  dealGapEmptyCard,
  dealGapFilterCard,
  dealGapHeaderCard,
  dealGapRowCard,
  dealGapSummaryCard,
} from "./recruiting-deal-gaps-cards.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

MountThreeColumnPage({
  active: "recruiting",
  refreshMe,
  logout,
  search,
  pageTitle: "Recruiting Deal Gaps",
  build({ center, right }: ThreeColumnLayout): void {
    center.append(SkeletonCardC(), SkeletonCardC());
    loadDealGaps(center, right);
  },
});

/**
 * Loads and renders the deal gap queue from current URL filters.
 * @param center - Main page column.
 * @param right - Summary rail column.
 */
function loadDealGaps(center: HTMLElement, right: HTMLElement): void {
  api(`/RecruitingDealDataGaps${resourceQuery()}`)
    .then((data: unknown) => {
      clearC(center);
      clearC(right);
      renderDealGaps(data as DealGapResponse, center, right);
    })
    .catch((error: unknown) => {
      console.error("Recruiting deal gaps failed to load", errorMessage(error));
      clearC(center);
      center.appendChild(
        EmptyCardC({
          title: "Could not load recruiting deal gaps",
          body: "Public recruiting deal gaps are temporarily unavailable. Try again shortly.",
        })
      );
    });
}

/**
 * Builds a normalized resource query from the shareable browser URL.
 * @returns Query string for `/RecruitingDealDataGaps`.
 */
function resourceQuery(): string {
  const current = new URLSearchParams(location.search);
  const params = new URLSearchParams();
  copyParam(current, params, "firm");
  copyParam(current, params, "state");
  copyParam(current, params, "year");
  copyParam(current, params, "direction");
  copyParam(current, params, "gapType");
  copyParam(current, params, "unresolved");
  params.set("limit", String(boundedLimit(current.get("limit"))));
  return `?${params.toString()}`;
}

/**
 * Copies one non-empty query parameter.
 * @param source - Current browser query.
 * @param target - Resource query under construction.
 * @param name - Parameter name.
 */
function copyParam(
  source: URLSearchParams,
  target: URLSearchParams,
  name: string
): void {
  const value = source.get(name)?.trim();
  if (value) target.set(name, value);
}

/**
 * Normalizes requested page size.
 * @param value - Raw `limit` query parameter.
 * @returns Bounded resource limit.
 */
function boundedLimit(value: string | null): number {
  const parsed = Number(String(value ?? "").trim() || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(parsed)));
}

/**
 * Renders the route sections.
 * @param data - Deal gap resource response.
 * @param center - Main page column.
 * @param right - Summary rail column.
 */
function renderDealGaps(
  data: DealGapResponse,
  center: HTMLElement,
  right: HTMLElement
): void {
  center.appendChild(dealGapHeaderCard(data));
  center.appendChild(dealGapFilterCard(data));
  center.appendChild(
    data.items.length ? rowsCard(data.items) : dealGapEmptyCard()
  );
  right.appendChild(dealGapSummaryCard(data));
}

/**
 * Builds the results card.
 * @param rows - Current page rows.
 * @returns Results card.
 */
function rowsCard(rows: readonly DealGapRow[]): HTMLElement {
  return SectionCardC({
    title: "Gap rows",
    attrs: { class: "deal-gap-results-card" },
    body: elC(
      "div",
      { class: "deal-gap-list" },
      ...rows.map(row => dealGapRowCard(row))
    ),
  });
}

/**
 * Extracts a user-facing message from a caught error.
 * @param error - Unknown error value.
 * @returns Error text.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
