import { BrokerCheckClient } from "../lib/brokercheck.js";
import { HarperREST, Resolver } from "../lib/brokercheck-load.js";
import {
  addCrawlSummaries,
  applyLimit,
  crdFromHit,
  crdFromSource,
  emptyCrawlSummary,
  incrementCrawl,
  incrementEnrich,
  matchingSearchSources,
  reachedLimit,
  remainingLimit,
  searchHits,
  stringValue,
  type BrokerRecord,
  type CrawlOptions,
  type CrawlState,
  type CrawlSummary,
  type EnrichSummary,
} from "./brokercheck_fetch_helpers.js";
import { fetchOneCrd, saveState } from "./fetch_brokercheck_core.js";

const PAGE_SIZE = 50;
const DEFAULT_SEARCH_MAX = 25;

/**
 * Matches existing advisors without CRDs against BrokerCheck search results.
 * @param client - BrokerCheck API client used for name search and CRD fetches.
 * @param rest - Harper REST writer used by the loader.
 * @param resolver - Entity resolver shared across loader calls.
 * @param state - Crawl state updated as matched CRDs are fetched.
 * @param opts - Write, max, force, and logging options for the enrichment run.
 * @returns Match and load counters for the enrichment run.
 */
export const enrichExistingAdvisors = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  opts: CrawlOptions = {}
): Promise<EnrichSummary> => {
  const advisors = ((await rest.get("/Advisor/")) ??
    []) as ReadonlyArray<BrokerRecord>;
  const targets = applyLimit(
    advisors.filter(advisor => !advisor.finraCrd),
    opts.max ?? 0
  );
  const log = opts.log ?? console.error;
  log(`[enrich] ${targets.length}/${advisors.length} advisors lack finraCrd`);
  return await targets.reduce<Promise<EnrichSummary>>(
    async (previous, advisor) => {
      const summary = await previous;
      const legalName = stringValue(advisor.legalName).trim();
      if (!legalName) return summary;
      const candidates = matchingSearchSources(
        await client.searchIndividual(legalName, undefined, 0, 5),
        advisor
      );
      return await handleAdvisorCandidates(
        candidates,
        legalName,
        client,
        rest,
        resolver,
        state,
        opts,
        summary
      );
    },
    Promise.resolve({ matched: 0, no_match: 0, ambiguous: 0, loaded: 0 })
  );
};

/**
 * Crawls all individuals returned by a BrokerCheck firm roster.
 * @param client - BrokerCheck API client used for roster pages and CRD fetches.
 * @param rest - Harper REST writer used by the loader.
 * @param resolver - Entity resolver shared across loader calls.
 * @param state - Crawl state updated as roster CRDs are fetched.
 * @param firmId - FINRA firm CRD whose roster should be crawled.
 * @param opts - Write, max, force, and logging options for the crawl.
 * @returns Fetch, skip, and error counters for the roster crawl.
 */
export const crawlFirmRoster = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  firmId: string,
  opts: CrawlOptions = {}
): Promise<CrawlSummary> => {
  return await crawlRosterPage(
    client,
    rest,
    resolver,
    state,
    firmId,
    opts,
    0,
    0
  );
};

/**
 * Searches names in BrokerCheck and fetches each resulting CRD.
 * @param client - BrokerCheck API client used for search and CRD fetches.
 * @param rest - Harper REST writer used by the loader.
 * @param resolver - Entity resolver shared across loader calls.
 * @param state - Crawl state updated as search CRDs are fetched.
 * @param query - BrokerCheck individual search query.
 * @param opts - Write, max, force, and logging options for the search.
 * @returns Fetch, skip, and error counters for the search crawl.
 */
export const crawlNameSearch = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  query: string,
  opts: CrawlOptions = {}
): Promise<CrawlSummary> => {
  const max = opts.max ?? DEFAULT_SEARCH_MAX;
  const hits = searchHits(
    await client.searchIndividual(query, undefined, 0, max)
  );
  return await fetchCrds(
    hits.slice(0, max).map(crdFromHit).filter(Boolean),
    client,
    rest,
    resolver,
    state,
    opts,
    `search ${query}`
  );
};

const handleAdvisorCandidates = async (
  candidates: ReadonlyArray<BrokerRecord>,
  legalName: string,
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  opts: CrawlOptions,
  summary: EnrichSummary
): Promise<EnrichSummary> => {
  const log = opts.log ?? console.error;
  if (candidates.length !== 1) {
    log(
      `[enrich] ${legalName}: ${candidates.length ? "ambiguous" : "no exact match"}`
    );
    return incrementEnrich(
      summary,
      candidates.length ? "ambiguous" : "no_match"
    );
  }
  const crd = crdFromSource(candidates[0]);
  if (!crd) return incrementEnrich(summary, "no_match");
  const counts = await fetchOneCrd(client, rest, resolver, state, crd, opts);
  await saveState(state);
  return incrementEnrich(
    incrementEnrich(summary, "matched"),
    counts ? "loaded" : undefined
  );
};

const crawlRosterPage = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  firmId: string,
  opts: CrawlOptions,
  page: number,
  seen: number
): Promise<CrawlSummary> => {
  const hits = searchHits(await client.firmRoster(firmId, page, PAGE_SIZE));
  if (!hits.length) return emptyCrawlSummary();
  const crds = rosterPageCrds(hits, opts, seen);
  const summary = await load(client, rest, resolver, state, opts, firmId, crds);
  const done = rosterPageComplete(
    hits.length,
    opts.max || 0,
    seen + crds.length
  );
  logRosterPage(opts, firmId, page, hits.length);
  if (done) return summary;
  return addCrawlSummaries(
    summary,
    await nextRosterPageSummary(
      client,
      rest,
      resolver,
      state,
      firmId,
      opts,
      page,
      seen,
      crds
    )
  );
};

const load = (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  opts: CrawlOptions,
  firmId: string,
  crds: readonly string[]
): Promise<CrawlSummary> =>
  fetchCrds(crds, client, rest, resolver, state, opts, `roster ${firmId}`);

const rosterPageCrds = (
  hits: ReadonlyArray<ReturnType<typeof searchHits>[number]>,
  opts: CrawlOptions,
  seen: number
): readonly string[] =>
  applyLimit(
    hits.map(crdFromHit).filter(Boolean),
    remainingLimit(opts.max ?? 0, seen)
  );

const nextRosterPageSummary = (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  firmId: string,
  opts: CrawlOptions,
  page: number,
  seen: number,
  crds: readonly string[]
): Promise<CrawlSummary> =>
  crawlNextRosterPage(
    client,
    rest,
    resolver,
    state,
    firmId,
    opts,
    page,
    seen + crds.length
  );

const logRosterPage = (
  opts: CrawlOptions,
  firmId: string,
  page: number,
  hitCount: number
): void => {
  (opts.log ?? console.error)(
    `[roster ${firmId}] page ${page}: ${hitCount} hits`
  );
};

const crawlNextRosterPage = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  firmId: string,
  opts: CrawlOptions,
  page: number,
  seen: number
): Promise<CrawlSummary> =>
  await crawlRosterPage(
    client,
    rest,
    resolver,
    state,
    firmId,
    opts,
    page + 1,
    seen
  );

const rosterPageComplete = (
  hitCount: number,
  max: number,
  seen: number
): boolean => hitCount < PAGE_SIZE || reachedLimit(max, seen);

const fetchCrds = async (
  crds: ReadonlyArray<string>,
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  opts: CrawlOptions,
  label: string
): Promise<CrawlSummary> => {
  return await crds.reduce<Promise<CrawlSummary>>(async (previous, crd) => {
    const summary = await previous;
    try {
      const counts = await fetchOneCrd(
        client,
        rest,
        resolver,
        state,
        crd,
        opts
      );
      await saveState(state);
      return incrementCrawl(summary, counts ? "fetched" : "skipped");
    } catch (error) {
      (opts.log ?? console.error)(`[${label}] ${crd}: ${String(error)}`);
      return incrementCrawl(summary, "errors");
    }
  }, Promise.resolve(emptyCrawlSummary()));
};
