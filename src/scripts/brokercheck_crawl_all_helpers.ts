import { BrokerCheckClient } from "../lib/brokercheck.js";
import { HarperREST, Resolver } from "../lib/brokercheck-load.js";
import {
  isRecord,
  stringValue,
  type BrokerRecord,
  type CrawlState,
} from "./brokercheck_fetch_helpers.js";
import { fetchOneFirm, saveState } from "./fetch_brokercheck_core.js";
import { walkFirmRosters } from "./brokercheck_crawl_rosters.js";

/** Logger used by the multi-phase BrokerCheck crawler. */
export type CrawlLogger = (...parts: ReadonlyArray<unknown>) => Promise<void>;

/** Counters for the phase that matches Harper firm rows to FINRA CRDs. */
interface FirmLookupSummary {
  readonly matched: number;
  readonly ambiguous: number;
  readonly no_match: number;
  readonly errors: number;
}

/** Counters for loading firm profile snapshots from BrokerCheck. */
interface SnapshotSummary {
  readonly fetched: number;
  readonly skipped: number;
  readonly errors: number;
}

/** Runtime limits, filters, and logging for the firm-roster crawl phase. */
export interface WalkFirmRostersOptions {
  readonly maxPerFirm: number;
  readonly force: boolean;
  readonly deadline: number;
  readonly log: CrawlLogger;
  readonly onlyFirmId?: string;
}

/** Flags deciding which crawler phases should run. */
export interface CrawlPhaseFlags {
  readonly skipFirmLookup: boolean;
  readonly skipFirmSnapshots: boolean;
  readonly skipRosters: boolean;
}

export const runSelectedPhases = async (
  rest: HarperREST,
  client: BrokerCheckClient,
  resolver: Resolver,
  state: CrawlState,
  rosterOptions: WalkFirmRostersOptions,
  flags: CrawlPhaseFlags
): Promise<Readonly<Record<string, unknown>>> => ({
  ...(!flags.skipFirmLookup
    ? { firm_lookup: await lookupFirmCrds(rest, client, rosterOptions.log) }
    : {}),
  ...(!flags.skipFirmSnapshots
    ? {
        firm_snapshots: await fetchFirmSnapshots(
          rest,
          client,
          resolver,
          state,
          rosterOptions.force,
          rosterOptions.log
        ),
      }
    : {}),
  ...(!flags.skipRosters
    ? {
        rosters: await walkFirmRosters(
          rest,
          client,
          resolver,
          state,
          rosterOptions
        ),
      }
    : {}),
});

/**
 * Logs the phase-1 banner, then loads every Firm row from Harper.
 * Bundling the banner log with the fetch keeps the awaited firm rows out of a
 * scope where the log side effect would precede their definition.
 * @param rest - Harper REST client.
 * @param log - Crawl logger.
 * @returns All Firm rows.
 */
const fetchFirmsForLookup = async (
  rest: HarperREST,
  log: CrawlLogger
): Promise<ReadonlyArray<BrokerRecord>> => {
  await log("phase 1: firm CRD lookup");
  return rowsFrom(await rest.get("/Firm/"));
};

/**
 * Logs the missing-CRD count, then folds each target into a lookup summary.
 * Kept separate from {@link lookupFirmCrds} so the count log does not sit
 * between that function's definitions.
 * @param rest - Harper REST client.
 * @param client - BrokerCheck HTTP client.
 * @param targets - Firm rows still missing a FINRA CRD.
 * @param totalFirms - Total firm count, for the progress log.
 * @param log - Crawl logger.
 * @returns Aggregated firm-lookup counters.
 */
const reduceFirmLookups = async (
  rest: HarperREST,
  client: BrokerCheckClient,
  targets: ReadonlyArray<BrokerRecord>,
  totalFirms: number,
  log: CrawlLogger
): Promise<FirmLookupSummary> => {
  await log(`  ${targets.length}/${totalFirms} firms missing finraCrd`);
  return targets.reduce<Promise<FirmLookupSummary>>(
    async (previous, firm) =>
      addFirmLookupSummaries(
        await previous,
        await lookupFirmCrd(rest, client, firm, log)
      ),
    Promise.resolve(emptyFirmLookupSummary())
  );
};

const lookupFirmCrds = async (
  rest: HarperREST,
  client: BrokerCheckClient,
  log: CrawlLogger
): Promise<FirmLookupSummary> => {
  const firms = await fetchFirmsForLookup(rest, log);
  const targets = firms.filter(firm => !firm.finraCrd);
  const summary = await reduceFirmLookups(
    rest,
    client,
    targets,
    firms.length,
    log
  );
  await log(`phase 1 summary: ${JSON.stringify(summary)}`);
  return summary;
};

const fetchFirmSnapshots = async (
  rest: HarperREST,
  client: BrokerCheckClient,
  resolver: Resolver,
  state: CrawlState,
  force: boolean,
  log: CrawlLogger
): Promise<SnapshotSummary> => {
  const firms = rowsFrom(await rest.get("/Firm/")).filter(
    firm => firm.finraCrd
  );
  const snapshotResolver = Object.assign(resolver, { firmListing: null });
  const summary = await firms.reduce<Promise<SnapshotSummary>>(
    async (previous, firm) => {
      return addSnapshotSummaries(
        await previous,
        await fetchFirmSnapshot(
          client,
          rest,
          snapshotResolver,
          state,
          firm,
          force,
          log
        )
      );
    },
    Promise.resolve(emptySnapshotSummary())
  );
  await log("phase 2: firm snapshots");
  await log(`phase 2 summary: ${JSON.stringify(summary)}`);
  return summary;
};

const rowsFrom = (value: unknown): ReadonlyArray<BrokerRecord> =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const emptyFirmLookupSummary = (): FirmLookupSummary => ({
  matched: 0,
  ambiguous: 0,
  no_match: 0,
  errors: 0,
});

const emptySnapshotSummary = (): SnapshotSummary => ({
  fetched: 0,
  skipped: 0,
  errors: 0,
});

const addFirmLookupSummaries = (
  left: FirmLookupSummary,
  right: FirmLookupSummary
): FirmLookupSummary => ({
  matched: left.matched + right.matched,
  ambiguous: left.ambiguous + right.ambiguous,
  no_match: left.no_match + right.no_match,
  errors: left.errors + right.errors,
});

const addSnapshotSummaries = (
  left: SnapshotSummary,
  right: SnapshotSummary
): SnapshotSummary => ({
  fetched: left.fetched + right.fetched,
  skipped: left.skipped + right.skipped,
  errors: left.errors + right.errors,
});

const firmSearchCandidates = (
  raw: unknown,
  firmName: string
): ReadonlyArray<BrokerRecord> => {
  const hits = searchHitSources(raw);
  return hits.filter(source =>
    candidateFirmNames(source).some(candidate =>
      firmNameMatch(firmName, candidate)
    )
  );
};

const searchHitSources = (raw: unknown): ReadonlyArray<BrokerRecord> => {
  if (!isRecord(raw) || !isRecord(raw.hits)) return [];
  return rowsFrom(raw.hits.hits).map(hit =>
    isRecord(hit._source) ? hit._source : {}
  );
};

const candidateFirmNames = (source: BrokerRecord): ReadonlyArray<string> => [
  stringValue(source.firm_name),
  stringValue(source.ia_firm_name),
  ...stringArray(source.firm_other_names),
];

const stringArray = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];

const normalizeFirmName = (value: string): string => {
  return (value ?? "")
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .replace(/\b(l\.?l\.?c|inc|l\.?p|corp(?:oration)?|incorporated)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const firmNameMatch = (a: string, b: string): boolean => {
  return Boolean(a && b && normalizeFirmName(a) === normalizeFirmName(b));
};

const lookupFirmCrd = async (
  rest: HarperREST,
  client: BrokerCheckClient,
  firm: BrokerRecord,
  log: CrawlLogger
): Promise<FirmLookupSummary> => {
  const name = stringValue(firm.name).trim();
  if (!name) return emptyFirmLookupSummary();
  try {
    const raw = await client.searchFirm(name, 0, 10);
    const hits = searchHitSources(raw);
    const candidates = firmSearchCandidates(raw, name);
    if (candidates.length !== 1) {
      const key = candidates.length ? "ambiguous" : "no_match";
      await log(
        `  ${name}: ${candidates.length ? "ambiguous" : "no exact match"} (${hits.length} hits)`
      );
      return { ...emptyFirmLookupSummary(), [key]: 1 };
    }
    return await writeFirmCrd(rest, firm, name, candidates[0], log);
  } catch (error) {
    await log(`  ${name}: lookup failed: ${error}`);
    return { ...emptyFirmLookupSummary(), errors: 1 };
  }
};

const writeFirmCrd = async (
  rest: HarperREST,
  firm: BrokerRecord,
  name: string,
  candidate: BrokerRecord,
  log: CrawlLogger
): Promise<FirmLookupSummary> => {
  const crd = stringValue(candidate.firm_source_id || candidate.firmId);
  if (!crd) return { ...emptyFirmLookupSummary(), no_match: 1 };
  if (await rest.put("Firm", { ...firm, finraCrd: crd })) {
    await log(`  ${name}: matched firmId ${crd}`);
    return { ...emptyFirmLookupSummary(), matched: 1 };
  }
  return { ...emptyFirmLookupSummary(), errors: 1 };
};

const fetchFirmSnapshot = async (
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: CrawlState,
  firm: BrokerRecord,
  force: boolean,
  log: CrawlLogger
): Promise<SnapshotSummary> => {
  const crd = stringValue(firm.finraCrd);
  try {
    const counts = await fetchOneFirm(client, rest, resolver, state, crd, {
      force,
      log,
    });
    await saveState(state);
    return counts
      ? { ...emptySnapshotSummary(), fetched: 1 }
      : { ...emptySnapshotSummary(), skipped: 1 };
  } catch (error) {
    await log(`  firm ${crd} failed: ${error}`);
    return { ...emptySnapshotSummary(), errors: 1 };
  }
};
