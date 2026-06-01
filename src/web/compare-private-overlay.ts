// Signed-in-only private overlay for the advisor comparison page.

import type { AdvisorComparisonItem } from "../types/advisor-comparison.js";
import { api, refreshMe } from "./app.js";
import { el, SectionCard } from "./design-system/index.js";

/** Generic signature used to call design-system component factories. */
type DesignSystemComponent = (...args: ReadonlyArray<unknown>) => HTMLElement;

const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;

/** Private rating row returned by `/AdvisorRating/<id>`. */
interface PrivateRating {
  readonly ratingInt?: number | null;
  readonly responsiveness?: number | null;
  readonly transparency?: number | null;
  readonly performance?: number | null;
  readonly planningDepth?: number | null;
  readonly reviewText?: string | null;
}

/** Auth-aware private rating envelope returned by `/AdvisorRating/<id>`. */
interface RatingEnvelope {
  readonly authenticated?: boolean;
  readonly rating?: PrivateRating | null;
}

/** User-owned watchlist entry returned by `/UserWatchlists`. */
interface WatchlistEntry {
  readonly advisorId?: string;
  readonly rank?: number | null;
  readonly note?: string | null;
}

/** User-owned watchlist returned by `/UserWatchlists`. */
interface Watchlist {
  readonly name?: string;
  readonly entries?: ReadonlyArray<WatchlistEntry>;
}

/** Auth-aware watchlist envelope returned by `/UserWatchlists`. */
interface WatchlistsEnvelope {
  readonly authenticated?: boolean;
  readonly lists?: ReadonlyArray<Watchlist>;
}

/** Private watchlist note normalized for one compared advisor. */
interface PrivateWatchlistNote {
  readonly listName: string;
  readonly rank: number | null;
  readonly note: string;
}

/** Private overlay model for one compared advisor. */
interface PrivateAdvisorOverlay {
  readonly item: AdvisorComparisonItem;
  readonly notes: ReadonlyArray<PrivateWatchlistNote>;
  readonly rating: PrivateRating | null;
}

/** Populated private rating metric ready for display. */
interface RatingMetric {
  readonly label: string;
  readonly value: number;
}

/** Candidate private rating metric before empty dimensions are removed. */
interface CandidateRatingMetric {
  readonly label: string;
  readonly value: number | null | undefined;
}

/**
 * Mounts the signed-in-only private overlay after the public comparison table.
 * @param items - Advisor comparison items currently rendered.
 * @returns Empty mount point that remains empty for signed-out users.
 */
export function privateOverlayMount(
  items: ReadonlyArray<AdvisorComparisonItem>
): HTMLElement {
  const mount = el("div", { class: "comparison-private-mount" });
  void loadPrivateOverlay(mount, items);
  return mount;
}

/**
 * Loads and renders the current user's private comparison overlay.
 * @param mount - Private overlay mount point.
 * @param items - Advisor comparison items currently rendered.
 */
async function loadPrivateOverlay(
  mount: HTMLElement,
  items: ReadonlyArray<AdvisorComparisonItem>
): Promise<void> {
  const me = await refreshMe();
  if (!me?.authenticated) return;

  const foundItems = items.filter(item => item.status === "found");
  const [watchlists, ratings] = await Promise.all([
    api<WatchlistsEnvelope>("/UserWatchlists"),
    Promise.all(foundItems.map(item => loadRating(item.id))),
  ]);
  const overlays = foundItems
    .map((item, index) => ({
      item,
      notes: watchlistNotes(watchlists.lists ?? [], item.id),
      rating: ratings[index]?.rating ?? null,
    }))
    .filter(hasPrivateOverlay);

  if (overlays.length) mount.appendChild(privateOverlaySection(overlays));
}

/**
 * Loads the current user's private rating for one advisor.
 * @param advisorId - Compared advisor id.
 * @returns Private rating envelope.
 */
async function loadRating(advisorId: string): Promise<RatingEnvelope> {
  return await api<RatingEnvelope>(
    `/AdvisorRating/${encodeURIComponent(advisorId)}`
  );
}

/**
 * Collects private watchlist rank and notes for one advisor.
 * @param lists - Current user's watchlists.
 * @param advisorId - Compared advisor id.
 * @returns Matching private watchlist annotations.
 */
function watchlistNotes(
  lists: ReadonlyArray<Watchlist>,
  advisorId: string
): ReadonlyArray<PrivateWatchlistNote> {
  return lists.flatMap(list =>
    (list.entries ?? [])
      .filter(entry => entry.advisorId === advisorId)
      .map(entry => ({
        listName: list.name || "Watchlist",
        rank: entry.rank ?? null,
        note: entry.note ?? "",
      }))
  );
}

/**
 * Checks whether an advisor has private data worth rendering.
 * @param overlay - Candidate private overlay model.
 * @returns True when notes, ranks, ratings, or review text exist.
 */
function hasPrivateOverlay(overlay: PrivateAdvisorOverlay): boolean {
  return (
    overlay.notes.length > 0 ||
    ratingMetrics(overlay.rating).length > 0 ||
    Boolean(overlay.rating?.reviewText)
  );
}

/**
 * Builds the private overlay section.
 * @param overlays - Private advisor overlays with at least one annotation.
 * @returns Section card containing the private overlay.
 */
function privateOverlaySection(
  overlays: ReadonlyArray<PrivateAdvisorOverlay>
): HTMLElement {
  return SectionCardComponent({
    title: "Private notes and ratings",
    body: el(
      "div",
      { class: "comparison-private-grid" },
      overlays.map(privateOverlayCard)
    ),
    attrs: { class: "comparison-private" },
  });
}

/**
 * Builds one private advisor overlay card.
 * @param overlay - Private advisor overlay model.
 * @returns Advisor-specific private overlay card.
 */
function privateOverlayCard(overlay: PrivateAdvisorOverlay): HTMLElement {
  return el(
    "article",
    { class: "comparison-private-card" },
    el("h3", {}, overlay.item.displayName),
    overlay.notes.length ? privateNotesSummary(overlay.notes) : null,
    ratingMetrics(overlay.rating).length || overlay.rating?.reviewText
      ? privateRatingSummary(overlay.rating)
      : null
  );
}

/**
 * Builds private watchlist notes for one advisor.
 * @param notes - Matching private watchlist notes.
 * @returns Watchlist note block.
 */
function privateNotesSummary(
  notes: ReadonlyArray<PrivateWatchlistNote>
): HTMLElement {
  return el(
    "div",
    { class: "comparison-private-block" },
    el("h4", {}, "Watchlist notes"),
    notes.map(note =>
      el(
        "p",
        { class: "comparison-private-note" },
        `${note.listName}${note.rank ? ` #${note.rank}` : ""}`,
        note.note ? el("span", {}, note.note) : null
      )
    )
  );
}

/**
 * Builds a compact private rating summary.
 * @param rating - Private rating row.
 * @returns Rating summary element.
 */
function privateRatingSummary(rating: PrivateRating | null): HTMLElement {
  return el(
    "div",
    { class: "comparison-private-block" },
    el("h4", {}, "Private rating"),
    ratingMetrics(rating).length
      ? el(
          "dl",
          { class: "comparison-private-metrics" },
          ratingMetrics(rating).map(metric => [
            el("dt", {}, metric.label),
            el("dd", {}, String(metric.value)),
          ])
        )
      : null,
    rating?.reviewText
      ? el("p", { class: "comparison-private-review" }, rating.reviewText)
      : null
  );
}

/**
 * Returns populated private rating dimensions.
 * @param rating - Private rating row.
 * @returns Human-readable rating metrics.
 */
function ratingMetrics(
  rating: PrivateRating | null
): ReadonlyArray<RatingMetric> {
  if (!rating) return [];
  const metrics: ReadonlyArray<CandidateRatingMetric> = [
    { label: "Overall", value: rating.ratingInt },
    { label: "Responsiveness", value: rating.responsiveness },
    { label: "Transparency", value: rating.transparency },
    { label: "Performance", value: rating.performance },
    { label: "Planning depth", value: rating.planningDepth },
  ];
  return metrics.filter(isRatingMetric);
}

/**
 * Narrows a nullable rating metric to a populated one.
 * @param metric - Candidate private rating metric.
 * @returns True when the metric has a numeric value.
 */
function isRatingMetric(metric: CandidateRatingMetric): metric is RatingMetric {
  return metric.value != null;
}
