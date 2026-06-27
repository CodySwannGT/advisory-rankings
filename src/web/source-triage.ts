import type {
  SourceArticleTriageResponse,
  SourceArticleTriageRow,
} from "../harper/resource-source-article-triage.js";
import {
  SOURCE_ARTICLE_TRIAGE_REASON_TOKENS,
  type SourceArticleTriageReason,
} from "../harper/resource-source-article-triage-reasons.js";

import { api, refreshMe, logout, search } from "./app.js";
import {
  emptyResultsCard,
  filterCard,
  headerCard,
  summaryCard,
} from "./source-triage-cards.js";
import { sourceArticleTriageRowCard } from "./source-triage-row.js";
import {
  EmptyCard,
  SectionCard,
  SkeletonCard,
  clear,
  el,
  mountThreeColumnPage,
} from "./design-system/index.js";

/** Callable adapter for untyped design-system components. */
type DesignSystemComponent = (...args: ReadonlyArray<unknown>) => HTMLElement;

/** Columns supplied by the shared three-column page shell. */
interface ThreeColumnLayout {
  readonly center: HTMLElement;
  readonly right: HTMLElement;
}

/** Options accepted by the typed page-shell adapter. */
interface MountThreeColumnPageOptions {
  readonly active: string;
  readonly refreshMe: typeof refreshMe;
  readonly logout: typeof logout;
  readonly search: typeof search;
  readonly pageTitle: string;
  readonly build: (layout: ThreeColumnLayout) => void;
}

const MountThreeColumnPage = mountThreeColumnPage as unknown as (
  options: MountThreeColumnPageOptions
) => void;
const SectionCardC = SectionCard as unknown as DesignSystemComponent;
const EmptyCardC = EmptyCard as unknown as DesignSystemComponent;
const SkeletonCardC = SkeletonCard as unknown as DesignSystemComponent;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

MountThreeColumnPage({
  active: "source-triage",
  refreshMe,
  logout,
  search,
  pageTitle: "Source Article Triage",
  build({ center, right }: ThreeColumnLayout): void {
    center.append(SkeletonCardC(), SkeletonCardC());
    loadTriage(center, right);
  },
});

/**
 * Loads and renders the source triage page from current URL filters.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function loadTriage(center: HTMLElement, right: HTMLElement): void {
  api<SourceArticleTriageResponse>(`/SourceArticleTriage${resourceQuery()}`)
    .then(data => {
      clear(center);
      clear(right);
      renderTriage(data, center, right);
    })
    .catch(error => {
      console.error("Source triage route failed to load", errorMessage(error));
      clear(center);
      center.appendChild(
        EmptyCardC({
          title: "Could not load source triage",
          body: "Source article triage is temporarily unavailable. Try again shortly.",
        })
      );
    });
}

/**
 * Builds a bounded SourceArticleTriage resource query from the browser URL.
 * @returns Resource query string.
 */
function resourceQuery(): string {
  const current = new URLSearchParams(location.search);
  const params = new URLSearchParams();
  const category = current.get("category")?.trim();
  const reason = current.get("reason")?.trim();
  if (category) params.set("category", category);
  if (isReason(reason)) params.set("reason", reason);
  params.set("limit", String(boundedLimit(current.get("limit"))));
  return `?${params.toString()}`;
}

/**
 * Renders all route sections from the resource payload.
 * @param data - Triage resource response.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function renderTriage(
  data: SourceArticleTriageResponse,
  center: HTMLElement,
  right: HTMLElement
): void {
  center.appendChild(headerCard(data));
  center.appendChild(filterCard(data));
  center.appendChild(
    data.items.length ? rowsCard(data.items) : emptyResultsCard()
  );
  right.appendChild(summaryCard(data));
}

/**
 * Builds the card containing triage result rows.
 * @param rows - Source article triage rows.
 * @returns Results card.
 */
function rowsCard(rows: ReadonlyArray<SourceArticleTriageRow>): HTMLElement {
  return SectionCardC({
    title: "Articles needing review",
    attrs: { class: "source-triage-results-card" },
    body: el(
      "div",
      { class: "source-triage-list" },
      ...rows.map(sourceArticleTriageRowCard)
    ),
  });
}

/**
 * Checks whether a raw query value is a supported triage reason.
 * @param value - Raw query value.
 * @returns True for known reason tokens.
 */
function isReason(
  value: string | null | undefined
): value is SourceArticleTriageReason {
  return SOURCE_ARTICLE_TRIAGE_REASON_TOKENS.includes(
    value as SourceArticleTriageReason
  );
}

/**
 * Normalizes the shareable queue size from the browser URL.
 * @param value - Raw `limit` search value.
 * @returns Bounded resource limit.
 */
function boundedLimit(value: string | null): number {
  const parsed = Number(String(value ?? "").trim() || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(parsed)));
}

/**
 * Extracts a user-facing error message.
 * @param error - Unknown thrown value.
 * @returns Error message.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
