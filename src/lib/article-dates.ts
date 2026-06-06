const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Shape accepted by article date derivation across ingest loaders.
 */
interface ArticleDateSource {
  readonly publishedDate?: unknown;
  readonly date?: unknown;
  readonly modifiedDate?: unknown;
  readonly modified?: unknown;
  readonly crawledAt?: unknown;
  readonly fetchedAt?: unknown;
  readonly loadedAt?: unknown;
}

/**
 * Resolves the required Article.publishedDate plus optional modifiedDate.
 * @param source - Candidate source fields from WP JSON or extraction payloads.
 * @param now - Clock used only when the source has no date-like field.
 * @returns Dates safe to persist on Article rows.
 */
export function articleDates(
  source: ArticleDateSource,
  now: Date = new Date()
): Readonly<
  Record<"publishedDate", string> & Partial<Record<"modifiedDate", string>>
> {
  const publishedDate =
    firstValidDate([
      source.publishedDate,
      source.date,
      source.modifiedDate,
      source.modified,
      source.crawledAt,
      source.fetchedAt,
      source.loadedAt,
    ]) ?? dateOnly(now.toISOString());
  const modifiedDate =
    firstValidDate([
      source.modifiedDate,
      source.modified,
      source.publishedDate,
      source.date,
      source.crawledAt,
      source.fetchedAt,
      source.loadedAt,
    ]) ?? publishedDate;
  return modifiedDate === publishedDate
    ? { publishedDate }
    : { publishedDate, modifiedDate };
}

/**
 * Returns the first candidate that can be represented as YYYY-MM-DD.
 * @param candidates - Date-like values in priority order.
 * @returns Normalized date string, or null when no candidate is valid.
 */
function firstValidDate(candidates: readonly unknown[]): string | null {
  for (const candidate of candidates) {
    const parsed = parseDateOnly(candidate);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Parses date-like input into a Harper Date-compatible YYYY-MM-DD value.
 * @param value - Candidate date value.
 * @returns Normalized date string, or null when invalid.
 */
function parseDateOnly(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return dateOnly(value.toISOString());
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  if (DATE_ONLY.test(text)) return text;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime())
    ? dateOnly(parsed.toISOString())
    : null;
}

const dateOnly = (value: string): string => value.slice(0, 10);
