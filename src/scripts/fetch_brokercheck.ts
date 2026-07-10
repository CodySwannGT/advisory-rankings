#!/usr/bin/env node
import { readFile } from "node:fs/promises";

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
  type BrokerRecord,
  type Counts,
  type CrawlOptions,
  type CrawlState,
  type LogFn,
} from "./brokercheck_fetch_helpers.js";
import {
  fetchOneCrd,
  fetchOneFirm,
  loadState,
  saveState,
} from "./fetch_brokercheck_core.js";

const MODE_REQUIRED_ERROR = "one BrokerCheck fetch mode is required";
const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const has = (name: string): boolean => process.argv.includes(name);

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
  const opts = { write, max, force: has("--force"), log };
  const crd = arg("--crd");
  if (crd) return await fetchOneCrd(client, rest, resolver, state, crd, opts);
  const firmId = arg("--firm-id");
  if (firmId)
    return await fetchOneFirm(client, rest, resolver, state, firmId, opts);
  const crawls = await import("./fetch_brokercheck_crawls.js");
  const crawlResult = await runSelectedCrawlMode(
    crawls,
    client,
    rest,
    resolver,
    state,
    opts
  );
  if (crawlResult !== null) return crawlResult;
  throw new Error(MODE_REQUIRED_ERROR);
};

const runSelectedCrawlMode = async (
  crawls: typeof import("./fetch_brokercheck_crawls.js"),
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  opts: CrawlOptions
): Promise<unknown | null> => {
  if (has("--enrich"))
    return await crawls.enrichExistingAdvisors(
      client,
      rest,
      resolver,
      state,
      opts
    );
  const searchName = arg("--search-name");
  if (searchName)
    return await crawls.crawlNameSearch(
      client,
      rest,
      resolver,
      state,
      searchName,
      opts
    );
  const firmRoster = arg("--firm-roster");
  return firmRoster
    ? await crawls.crawlFirmRoster(
        client,
        rest,
        resolver,
        state,
        firmRoster,
        opts
      )
    : null;
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
