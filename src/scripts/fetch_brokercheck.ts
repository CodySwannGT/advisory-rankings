#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  BrokerCheckBlocked,
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
  type LogFn,
} from "./brokercheck_fetch_helpers.js";
const STATE_FILE = "research/brokercheck-state.json";
const SKIP_RECENT_DAYS = 7;
const SKIP_RECENT_MS = SKIP_RECENT_DAYS * 86_400_000;
const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const has = (name: string): boolean => process.argv.includes(name);

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

const loadIndividualContent = async (
  content: BrokerRecord,
  write: boolean,
  rest = new HarperREST(),
  resolver = new Resolver(rest)
): Promise<Counts> => {
  return await loadIndividual(parseIndividual(content), content, {
    rest,
    resolver,
    write,
  });
};

const loadFirmContent = async (
  content: BrokerRecord,
  write: boolean,
  rest = new HarperREST(),
  resolver = new Resolver(rest)
): Promise<Counts> => {
  return await loadFirm(parseFirm(content), content, { rest, resolver, write });
};

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

const runFixture = async (
  fixturePath: string,
  write: boolean,
  rest: HarperREST,
  resolver: Resolver
): Promise<Counts> => {
  const raw = JSON.parse(await readFile(fixturePath, "utf8")) as BrokerRecord;
  const individual = unwrapIndividual(raw) as BrokerRecord | null;
  const firm = unwrapFirm(raw) as BrokerRecord | null;
  if (individual)
    return await loadIndividualContent(individual, write, rest, resolver);
  if (firm) return await loadFirmContent(firm, write, rest, resolver);
  return {};
};

const runSelectedMode = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  write: boolean,
  max: number,
  log: LogFn
): Promise<unknown> => {
  const force = has("--force");
  const crd = arg("--crd");
  if (crd)
    return await fetchOneCrd(client, rest, resolver, state, crd, {
      write,
      force,
      log,
    });
  const firmId = arg("--firm-id");
  if (firmId)
    return await fetchOneFirm(client, rest, resolver, state, firmId, {
      write,
      force,
      log,
    });
  const crawls = await import("./fetch_brokercheck_crawls.js");
  if (has("--enrich"))
    return await crawls.enrichExistingAdvisors(client, rest, resolver, state, {
      write,
      max,
      force,
      log,
    });
  const searchName = arg("--search-name");
  if (searchName)
    return await crawls.crawlNameSearch(
      client,
      rest,
      resolver,
      state,
      searchName,
      { write, max, force, log }
    );
  const firmRoster = arg("--firm-roster");
  if (firmRoster)
    return await crawls.crawlFirmRoster(
      client,
      rest,
      resolver,
      state,
      firmRoster,
      { write, max, force, log }
    );
  throw new Error(
    "one mode required: --crd, --firm-id, --enrich, --search-name, --firm-roster, or --from-fixture"
  );
};

const main = async (): Promise<void> => {
  const write = !has("--dry-run");
  const max = Number(arg("--max") ?? "12");
  const quiet = has("--quiet");
  const log = quiet ? () => undefined : console.error;
  const client = new BrokerCheckClient({
    rateSeconds: numberArg("--rate-seconds"),
    verbose: !quiet,
  });
  const state = await loadState();
  const fromFixture = arg("--from-fixture");
  const rest = restForMode(Boolean(!write && fromFixture), !quiet);
  const resolver = new Resolver(rest);
  const result = fromFixture
    ? await runFixture(fromFixture, write, rest, resolver)
    : await runSelectedMode(client, rest, resolver, state, write, max, log);
  console.log(JSON.stringify(result, null, 2));
  await saveState(state);
};

const restForMode = (fixtureDryRun: boolean, verbose: boolean): HarperREST => {
  if (!fixtureDryRun) return new HarperREST({ verbose });
  return {
    readCount: 0,
    writeCount: 0,
    get: async () => [],
    put: async () => false,
  } as unknown as HarperREST;
};

const numberArg = (name: string): number | undefined =>
  arg(name) ? Number(arg(name)) : undefined;

await main().catch(error => {
  if (error instanceof BrokerCheckBlocked) {
    console.error(error.message);
    process.exitCode = 75;
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
