/** Logger contract used by BrokerCheck crawl scripts. */
export interface LogFn {
  (...args: ReadonlyArray<unknown>): void;
}

/** Loader row counts keyed by Harper table name. */
export interface Counts {
  readonly [table: string]: number;
}

/** Untyped BrokerCheck JSON object after runtime shape checks. */
export interface BrokerRecord {
  readonly [key: string]: unknown;
}

/** BrokerCheck search hit wrapper. */
export interface BrokerHit {
  readonly _source?: BrokerRecord;
}

/** Persistent crawl bucket keyed by CRD. */
export interface CrawlStateBucket {
  readonly [id: string]: unknown;
}

/** Persistent BrokerCheck crawl state. */
export interface CrawlState {
  readonly individuals: CrawlStateBucket;
  readonly firms: CrawlStateBucket;
}

/** Shared options for BrokerCheck crawl modes. */
export interface CrawlOptions {
  readonly write?: boolean;
  readonly max?: number;
  readonly force?: boolean;
  readonly log?: LogFn;
}

/** Fetch/skip/error counters returned by crawl modes. */
export interface CrawlSummary {
  readonly fetched: number;
  readonly skipped: number;
  readonly errors: number;
}

/** Match/load counters returned by advisor enrichment. */
export interface EnrichSummary {
  readonly matched: number;
  readonly no_match: number;
  readonly ambiguous: number;
  readonly loaded: number;
}

export const emptyCrawlState = (): CrawlState => ({
  individuals: {},
  firms: {},
});
export const emptyCrawlSummary = (): CrawlSummary => ({
  fetched: 0,
  skipped: 0,
  errors: 0,
});

export const normalizeState = (value: unknown): CrawlState => {
  if (!isRecord(value)) return emptyCrawlState();
  return {
    individuals: isRecord(value.individuals) ? value.individuals : {},
    firms: isRecord(value.firms) ? value.firms : {},
  };
};

export const isRecord = (value: unknown): value is BrokerRecord => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const stringValue = (value: unknown): string => {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
};

export const lowerString = (value: unknown): string =>
  stringValue(value).toLowerCase();

export const recentlyFetched = (value: unknown, maxAgeMs: number): boolean => {
  const fetchedAt = isRecord(value) ? value.fetchedAt : value;
  if (typeof fetchedAt !== "string") return false;
  const last = Date.parse(fetchedAt);
  return Number.isFinite(last) && Date.now() - last < maxAgeMs;
};

export const nameMatches = (
  advisorRow: BrokerRecord,
  searchHit: BrokerRecord
): boolean => {
  const advisorFirst = lowerString(advisorRow.firstName);
  const advisorLast = lowerString(advisorRow.lastName);
  const searchFirst = lowerString(searchHit.ind_firstname);
  const searchLast = lowerString(searchHit.ind_lastname);
  if (advisorFirst && advisorLast)
    return advisorFirst === searchFirst && advisorLast === searchLast;
  const legalName = lowerString(advisorRow.legalName);
  return Boolean(
    searchFirst &&
    searchLast &&
    legalName.includes(searchFirst) &&
    legalName.includes(searchLast)
  );
};

export const searchHits = (raw: unknown): ReadonlyArray<BrokerHit> => {
  if (!isRecord(raw) || !isRecord(raw.hits)) return [];
  const hits = raw.hits.hits;
  return Array.isArray(hits)
    ? hits.filter(isRecord).map(hit => ({
        _source: isRecord(hit._source) ? hit._source : undefined,
      }))
    : [];
};

export const matchingSearchSources = (
  raw: unknown,
  advisor: BrokerRecord
): ReadonlyArray<BrokerRecord> => {
  return searchHits(raw)
    .map(hit => hit._source ?? {})
    .filter(source => nameMatches(advisor, source));
};

export const crdFromSource = (source: BrokerRecord): string => {
  return stringValue(source.ind_source_id || source.individualId);
};

export const crdFromHit = (hit: BrokerHit): string =>
  crdFromSource(hit._source ?? {});

export const applyLimit = <T>(
  items: ReadonlyArray<T>,
  max: number
): ReadonlyArray<T> => {
  return max ? items.slice(0, max) : items;
};

export const remainingLimit = (max: number, seen: number): number => {
  return max ? Math.max(max - seen, 0) : 0;
};

export const reachedLimit = (max: number, seen: number): boolean =>
  Boolean(max && seen >= max);

export const incrementCrawl = (
  summary: CrawlSummary,
  key: keyof CrawlSummary
): CrawlSummary => {
  return { ...summary, [key]: summary[key] + 1 };
};

export const addCrawlSummaries = (
  left: CrawlSummary,
  right: CrawlSummary
): CrawlSummary => ({
  fetched: left.fetched + right.fetched,
  skipped: left.skipped + right.skipped,
  errors: left.errors + right.errors,
});

export const incrementEnrich = (
  summary: EnrichSummary,
  key?: keyof EnrichSummary
): EnrichSummary => {
  return key ? { ...summary, [key]: summary[key] + 1 } : summary;
};

export const updateState = (
  state: CrawlState,
  patch: Partial<CrawlState>
): void => {
  Object.assign(state, patch);
};
