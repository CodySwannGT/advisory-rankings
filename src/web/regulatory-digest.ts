import type {
  ArticlePayload,
  DisclosureEventCard,
  FeedItem,
  FirmChip,
} from "../harper/resource-feed-types.js";

/** Ranked disclosure item shown in the public regulatory digest. */
export interface RegulatoryDigestItem {
  readonly disclosure: DisclosureEventCard;
  readonly article: ArticlePayload;
  readonly firm: FirmChip | null;
  readonly eventDate: string | null;
  readonly severityScore: number;
  readonly sourceIndicator: string;
}

/**
 * Builds digest rows from public feed disclosure cards, sorted by observable
 * event recency first and severity signals second.
 * @param items - Feed items returned from compliance-disclosures mode.
 * @returns Ranked public regulatory digest rows.
 */
export function regulatoryDigestItems(
  items: readonly FeedItem[]
): readonly RegulatoryDigestItem[] {
  return items
    .flatMap(item =>
      (item.eventCards ?? [])
        .filter(isDisclosureCard)
        .map(disclosure =>
          digestItem(
            disclosure,
            item.article ?? fallbackArticle(disclosure),
            (item.firms ?? [])[0] ?? null
          )
        )
    )
    .reduce<readonly RegulatoryDigestItem[]>(insertDigestItem, [])
    .slice(0, 10);
}

/**
 * Extracts disclosure cards from feed items for the compatible event list.
 * @param items - Feed items returned from compliance-disclosures mode.
 * @returns First public disclosure cards.
 */
export function disclosureEvents(
  items: readonly FeedItem[]
): readonly DisclosureEventCard[] {
  return items
    .flatMap(item => (item.eventCards ?? []).filter(isDisclosureCard))
    .slice(0, 25);
}

/**
 * Formats advisor or fallback firm/article context for digest rows.
 * @param item - Ranked digest item.
 * @returns Plain-language context.
 */
export function digestContext(item: RegulatoryDigestItem): string {
  return (
    item.disclosure.advisor?.name ||
    item.firm?.name ||
    item.article.headline ||
    "Regulatory event"
  );
}

/**
 * Formats source/freshness text for digest rows.
 * @param item - Ranked digest item.
 * @returns Source indicator copy.
 */
export function digestSourceLabel(item: RegulatoryDigestItem): string {
  return item.eventDate
    ? `Event date ${item.eventDate}; ${item.sourceIndicator}`
    : item.sourceIndicator;
}

/**
 * Combines one disclosure card with its article source metadata.
 * @param disclosure - Public disclosure event card.
 * @param article - Source article attached to the feed item.
 * @param firm - First public firm chip attached to the feed item.
 * @returns Digest item with normalized date and source labels.
 */
function digestItem(
  disclosure: DisclosureEventCard,
  article: ArticlePayload,
  firm: FirmChip | null
): RegulatoryDigestItem {
  const eventDate = displayDate(
    disclosure.dateResolved ?? disclosure.dateInitiated ?? article.publishedDate
  );
  const publishedDate = displayDate(article.publishedDate);
  return {
    disclosure,
    article,
    firm,
    eventDate,
    severityScore: severityScore(disclosure),
    sourceIndicator: publishedDate
      ? `source published ${publishedDate}`
      : "source date unavailable",
  };
}

/**
 * Narrows a feed event card to its disclosure variant.
 * @param card - Feed event card candidate.
 * @returns True when the card is a disclosure event.
 */
function isDisclosureCard(
  card: FeedItem["eventCards"][number]
): card is DisclosureEventCard {
  return card.kind === "disclosure";
}

/**
 * Sorts digest rows by event recency, severity, then article recency.
 * @param left - First digest item.
 * @param right - Second digest item.
 * @returns Standard comparator result.
 */
function compareDigestItems(
  left: RegulatoryDigestItem,
  right: RegulatoryDigestItem
): number {
  const dateDelta = timestamp(right.eventDate) - timestamp(left.eventDate);
  if (dateDelta !== 0) return dateDelta;
  const severityDelta = right.severityScore - left.severityScore;
  if (severityDelta !== 0) return severityDelta;
  return displayDate(right.article.publishedDate).localeCompare(
    displayDate(left.article.publishedDate)
  );
}

/**
 * Inserts one digest item into a sorted immutable list.
 * @param sorted - Previously sorted digest items.
 * @param item - Digest item to insert.
 * @returns New sorted list containing the item.
 */
function insertDigestItem(
  sorted: readonly RegulatoryDigestItem[],
  item: RegulatoryDigestItem
): readonly RegulatoryDigestItem[] {
  const index = sorted.findIndex(
    existing => compareDigestItems(item, existing) < 0
  );
  if (index < 0) return [...sorted, item];
  return [...sorted.slice(0, index), item, ...sorted.slice(index)];
}

/**
 * Converts a display date string into a sortable timestamp.
 * @param value - Normalized display date.
 * @returns Millisecond timestamp, or zero when unavailable.
 */
function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normalizes date-like Harper values for browser display and comparison.
 * @param value - Harper date value from the feed payload.
 * @returns ISO-ish date string or an empty string.
 */
function displayDate(value: ArticlePayload["publishedDate"]): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).split("T")[0] ?? "";
}

/**
 * Builds a minimal source article when legacy retry fixtures omit article data.
 * @param disclosure - Public disclosure event card.
 * @returns Placeholder article metadata for digest rendering.
 */
function fallbackArticle(disclosure: DisclosureEventCard): ArticlePayload {
  return {
    id: disclosure.disclosureId || disclosure.id,
    headline: disclosure.advisor?.name
      ? `${disclosure.advisor.name} regulatory event`
      : "Regulatory event",
    dek: "",
    url: "#",
    slug: undefined,
    publishedDate: undefined,
    modifiedDate: undefined,
    authors: [],
    category: "regulatory",
  };
}

/**
 * Computes a transparent severity score from visible disclosure signals.
 * @param disclosure - Public disclosure event card.
 * @returns Relative score for same-date ordering.
 */
function severityScore(disclosure: DisclosureEventCard): number {
  return (
    sanctionScore(disclosure) +
    moneyScore(disclosure.awardAmount) +
    moneyScore(disclosure.settlementAmount) +
    moneyScore(disclosure.damagesRequested) +
    keywordScore([
      disclosure.disclosureType,
      disclosure.status,
      disclosure.allegationText,
      ...(disclosure.ruleViolations ?? []),
      ...(disclosure.sanctions ?? []).map(sanction => sanction.sanctionType),
    ])
  );
}

/**
 * Scores the presence of rendered sanction rows.
 * @param disclosure - Public disclosure event card.
 * @returns Sanction contribution to severity.
 */
function sanctionScore(disclosure: DisclosureEventCard): number {
  return (disclosure.sanctions ?? []).length * 20;
}

/**
 * Scores public monetary fields by rough magnitude.
 * @param value - Money value from award, settlement, or requested damages.
 * @returns Money contribution to severity.
 */
function moneyScore(value: number | undefined): number {
  if (value == null || value <= 0) return 0;
  if (value >= 1_000_000) return 25;
  if (value >= 100_000) return 15;
  return 8;
}

/**
 * Scores severe words visible in public disclosure fields.
 * @param values - Public text fields to scan.
 * @returns Keyword contribution to severity.
 */
function keywordScore(values: readonly (string | undefined)[]): number {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  return [
    ["bar", 35],
    ["suspend", 30],
    ["criminal", 25],
    ["fraud", 20],
    ["customer", 15],
    ["fine", 10],
  ].reduce((score, [needle, points]) => {
    return text.includes(String(needle)) ? score + Number(points) : score;
  }, 0);
}
