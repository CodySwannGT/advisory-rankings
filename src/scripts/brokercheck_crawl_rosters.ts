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

export const walkFirmRosters = async (
  rest: HarperREST,
  client: BrokerCheckClient,
  resolver: Resolver,
  state: CrawlState,
  opts: WalkFirmRostersOptions
): Promise<RosterSummary> => {
  await opts.log("phase 3: roster walks");
  const firms = await rosterFirmRows(rest, opts.onlyFirmId);
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
  await opts.log(
    `  walking ${firms.length} firms, cap ${opts.maxPerFirm || "unlimited"} advisors/firm`
  );
  const [firm, ...remaining] = firms;
  if (!firm) return total;
  if (Date.now() > opts.deadline) {
    await opts.log(
      `  runtime budget hit before firm ${stringValue(firm.finraCrd)}; stopping cleanly`
    );
    return total;
  }
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
    : await walkFirmRosterRows(
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
