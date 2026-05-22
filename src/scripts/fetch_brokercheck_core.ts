import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  BrokerCheckClient,
  unwrapFirm,
  unwrapIndividual,
} from "../lib/brokercheck.js";
import {
  HarperREST,
  Resolver,
  loadFirm,
  loadIndividual,
} from "../lib/brokercheck-load.js";
import { parseFirm, parseIndividual } from "../lib/brokercheck-parse.js";
import {
  emptyCrawlState,
  normalizeState,
  recentlyFetched,
  updateState,
  type BrokerRecord,
  type Counts,
  type CrawlOptions,
  type CrawlState,
} from "./brokercheck_fetch_helpers.js";

const STATE_FILE = "research/brokercheck-state.json";
const SKIP_RECENT_MS = 7 * 86_400_000;

/**
 * Loads BrokerCheck crawl state so repeat runs can skip recently fetched CRDs.
 * @returns Persisted crawl state, or empty buckets when the file does not exist.
 */
export const loadState = async (): Promise<CrawlState> => {
  try {
    return normalizeState(
      JSON.parse(await readFile(STATE_FILE, "utf8")) as unknown
    );
  } catch {
    return emptyCrawlState();
  }
};

/**
 * Persists BrokerCheck crawl state after each successful batch item.
 * @param state - Current state with recent individual and firm fetch markers.
 * @returns Resolves after the state file is written.
 */
export const saveState = async (state: CrawlState): Promise<void> => {
  await mkdir("research", { recursive: true });
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
};

const isRecentlyFetched = (value: unknown): boolean =>
  recentlyFetched(value, SKIP_RECENT_MS);

/**
 * Fetches one individual CRD, loads parsed rows, and records its fetch marker.
 * @param client - Rate-limited BrokerCheck API client.
 * @param rest - Harper REST writer used by the loader.
 * @param resolver - Entity resolver shared across loader calls.
 * @param state - Crawl state that is updated after a successful load.
 * @param crd - FINRA individual CRD.
 * @param opts - Write, force, and logging options for this request.
 * @returns Loader row counts, or null when the CRD was skipped or empty.
 */
export const fetchOneCrd = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  crd: string,
  opts: CrawlOptions = {}
): Promise<Counts | null> => {
  const log = opts.log ?? console.error;
  if (!opts.force && isRecentlyFetched(state.individuals[crd])) {
    log(`[skip] individual ${crd} fetched recently`);
    return null;
  }
  const content = unwrapIndividual(
    await client.getIndividual(crd)
  ) as BrokerRecord | null;
  if (!content) {
    log(`[warn] individual ${crd}: no content`);
    return null;
  }
  const parsed = parseIndividual(content);
  const counts = await loadIndividual(parsed, content, {
    rest,
    resolver,
    write: opts.write ?? true,
  });
  updateState(state, {
    individuals: {
      ...state.individuals,
      [crd]: {
        fetchedAt: new Date().toISOString(),
        legalName: parsed.advisor?.legalName ?? "",
        counts,
      },
    },
  });
  log(`[individual ${crd}] ${JSON.stringify(counts)}`);
  return counts;
};

/**
 * Fetches one firm, loads parsed rows, and records its fetch marker.
 * @param client - Rate-limited BrokerCheck API client.
 * @param rest - Harper REST writer used by the loader.
 * @param resolver - Entity resolver shared across loader calls.
 * @param state - Crawl state that is updated after a successful load.
 * @param firmId - FINRA firm CRD.
 * @param opts - Write, force, and logging options for this request.
 * @returns Loader row counts, or null when the firm was skipped or empty.
 */
export const fetchOneFirm = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  firmId: string,
  opts: CrawlOptions = {}
): Promise<Counts | null> => {
  const log = opts.log ?? console.error;
  if (!opts.force && isRecentlyFetched(state.firms[firmId])) {
    log(`[skip] firm ${firmId} fetched recently`);
    return null;
  }
  const content = unwrapFirm(
    await client.getFirm(firmId)
  ) as BrokerRecord | null;
  if (!content) {
    log(`[warn] firm ${firmId}: no content`);
    return null;
  }
  const parsed = parseFirm(content);
  const counts = await loadFirm(parsed, content, {
    rest,
    resolver,
    write: opts.write ?? true,
  });
  updateState(state, {
    firms: {
      ...state.firms,
      [firmId]: {
        fetchedAt: new Date().toISOString(),
        name: parsed.firm?.name ?? "",
        counts,
      },
    },
  });
  log(`[firm ${firmId}] ${JSON.stringify(counts)}`);
  return counts;
};
