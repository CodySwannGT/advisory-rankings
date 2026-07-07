import { BrokerCheckBlocked, BrokerCheckClient } from "../lib/brokercheck.js";
import { HarperREST, Resolver } from "../lib/brokercheck-load.js";
import {
  addCrawlSummaries,
  emptyCrawlSummary,
  isRecord,
  stringValue,
  type BrokerRecord,
  type CrawlState,
  type CrawlSummary,
} from "./brokercheck_fetch_helpers.js";
import { crawlFirmRoster } from "./fetch_brokercheck_crawls.js";
import { saveState } from "./fetch_brokercheck_core.js";
import type { WalkFirmRostersOptions } from "./brokercheck_crawl_all_helpers.js";

/** Roster crawl counters plus a stop marker for BrokerCheck rate blocking. */
interface RosterSummary extends CrawlSummary {
  readonly blocked: number;
}

/**
 * Logs the phase-3 banner, then loads the ordered roster firm rows.
 * Bundling the banner log with the fetch keeps the awaited firm rows out of a
 * scope where the log side effect would precede their definition.
 * @param rest - Harper REST client.
 * @param opts - Roster crawl options (logger and optional firm filter).
 * @returns Ordered firm rows to walk.
 */
const fetchRosterFirms = async (
  rest: HarperREST,
  opts: WalkFirmRostersOptions
): Promise<ReadonlyArray<BrokerRecord>> => {
  await opts.log("phase 3: roster walks");
  return rosterFirmRows(rest, opts.onlyFirmId);
};

export const walkFirmRosters = async (
  rest: HarperREST,
  client: BrokerCheckClient,
  resolver: Resolver,
  state: CrawlState,
  opts: WalkFirmRostersOptions
): Promise<RosterSummary> => {
  const firms = await fetchRosterFirms(rest, opts);
  const total = await walkFirmRosterRows(
    client,
    rest,
    resolver,
    state,
    firms,
    opts,
    emptyRosterSummary()
  );

  await opts.log(`phase 3 summary: ${JSON.stringify(total)}`);
  return total;
};

const emptyRosterSummary = (): RosterSummary => ({
  ...emptyCrawlSummary(),
  blocked: 0,
});

const addRosterSummaries = (
  left: RosterSummary,
  right: RosterSummary
): RosterSummary => ({
  ...addCrawlSummaries(left, right),
  blocked: left.blocked + right.blocked,
});

const rowsFrom = (value: unknown): ReadonlyArray<BrokerRecord> =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const rosterFirmRows = async (
  rest: HarperREST,
  onlyFirmId?: string
): Promise<ReadonlyArray<BrokerRecord>> => {
  const firms = rowsFrom(await rest.get("/Firm/"))
    .filter(firm => firm.finraCrd)
    .filter(firm => !onlyFirmId || stringValue(firm.finraCrd) === onlyFirmId);
  const disclosureCounts = await firmDisclosureCounts(rest);
  return [...firms].sort((left, right) => {
    const leftCount = disclosureCounts.get(stringValue(left.finraCrd)) ?? 0;
    const rightCount = disclosureCounts.get(stringValue(right.finraCrd)) ?? 0;
    return (
      leftCount - rightCount ||
      stringValue(left.name).localeCompare(stringValue(right.name))
    );
  });
};

const firmDisclosureCounts = async (
  rest: HarperREST
): Promise<ReadonlyMap<string, number>> => {
  const snapshots = rowsFrom(await rest.get("/BrokerCheckSnapshot/")).filter(
    snap => snap.subjectKind === "firm"
  );
  return new Map(
    snapshots.map(snap => [
      stringValue(snap.subjectCrd),
      Number(snap.disclosureCount ?? 0),
    ])
  );
};

const walkFirmRosterRows = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  firms: ReadonlyArray<BrokerRecord>,
  opts: WalkFirmRostersOptions,
  total: RosterSummary
): Promise<RosterSummary> => {
  const [firm, ...remaining] = firms;
  await opts.log(
    `  walking ${firms.length} firms, cap ${opts.maxPerFirm || "unlimited"} advisors/firm`
  );
  if (!firm) return total;
  if (Date.now() > opts.deadline) {
    await opts.log(
      `  runtime budget hit before firm ${stringValue(firm.finraCrd)}; stopping cleanly`
    );
    return total;
  }
  return walkRemainingRosters(
    client,
    rest,
    resolver,
    state,
    firm,
    remaining,
    opts,
    total
  );
};

/**
 * Walks one firm's roster, then recurses over the remaining firms.
 * Split out of {@link walkFirmRosterRows} so the awaited single-firm result
 * is defined at the top of its own scope rather than after the deadline guard.
 * @param client - BrokerCheck HTTP client.
 * @param rest - Harper REST client.
 * @param resolver - Entity resolver.
 * @param state - Mutable crawl checkpoint state.
 * @param firm - The firm to walk now.
 * @param remaining - Firms still queued after this one.
 * @param opts - Roster crawl options.
 * @param total - Running roster summary before this firm.
 * @returns Roster summary after this firm (and any recursion).
 */
const walkRemainingRosters = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  firm: BrokerRecord,
  remaining: ReadonlyArray<BrokerRecord>,
  opts: WalkFirmRostersOptions,
  total: RosterSummary
): Promise<RosterSummary> => {
  const result = await walkOneFirmRoster(
    client,
    rest,
    resolver,
    state,
    firm,
    opts
  );
  return result.blocked
    ? result
    : walkFirmRosterRows(
        client,
        rest,
        resolver,
        state,
        remaining,
        opts,
        addRosterSummaries(total, result)
      );
};

const walkOneFirmRoster = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  firm: BrokerRecord,
  opts: WalkFirmRostersOptions
): Promise<RosterSummary> => {
  const crd = stringValue(firm.finraCrd);
  try {
    await opts.log(`  firm ${crd} (${stringValue(firm.name)})`);
    const summary = await crawlFirmRoster(client, rest, resolver, state, crd, {
      max: opts.maxPerFirm,
      force: opts.force,
      log: opts.log,
    });
    await saveState(state);
    await opts.log(`  firm ${crd} done: ${JSON.stringify(summary)}`);
    return { ...summary, blocked: 0 };
  } catch (error) {
    if (error instanceof BrokerCheckBlocked) {
      await saveState(state);
      await opts.log(`  BrokerCheck blocked the crawl: ${error.message}`);
      return { ...emptyRosterSummary(), blocked: 1 };
    }
    await opts.log(`  firm ${crd} failed: ${error}`);
    return { ...emptyRosterSummary(), errors: 1 };
  }
};
