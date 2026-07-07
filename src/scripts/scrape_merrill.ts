#!/usr/bin/env node
import {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
  emptyMerrillRows,
  MERRILL_SOURCE_ADAPTER,
  type FirmSourceTable,
  type MerrillRows,
  type MerrillYextAdvisor,
} from "../lib/merrill.js";
import { describeTarget } from "../lib/harper.js";
import { targetUrl, writeRows } from "./_merrill_fabric.js";

/** Yext result envelope item containing one advisor record. */
interface YextResult {
  readonly data?: MerrillYextAdvisor;
}

/** Inner Yext response payload from Merrill's public locator API. */
interface YextResponsePayload {
  readonly resultsCount?: number;
  readonly results?: ReadonlyArray<YextResult>;
}

/** Yext response envelope returned by Merrill's public locator API. */
interface YextResponse {
  readonly response?: YextResponsePayload;
}

/** One fetched Yext page plus its total result count. */
interface AdvisorPage {
  readonly total: number;
  readonly results: ReadonlyArray<YextResult>;
}

/** Pagination accumulator used while walking the Yext result window. */
interface AdvisorPageState {
  readonly input: string;
  readonly maxAdvisors: number;
  readonly pageSize: number;
  readonly offset: number;
  readonly total: number;
  readonly advisors: ReadonlyArray<MerrillYextAdvisor>;
  readonly seenKeys: ReadonlyArray<string>;
}

const TABLE_ORDER = [
  "Firm",
  "FirmAlias",
  "Branch",
  "Advisor",
  "EmploymentHistory",
  "Designation",
  "Team",
  "TeamMembership",
  "AdvisorResearchCheck",
] as const satisfies ReadonlyArray<FirmSourceTable & keyof MerrillRows>;
const MAX_YEXT_OFFSET_LIMIT = 10_000;

/**
 * Reads the option value after a CLI flag.
 * @param name - Option name.
 * @returns The option value when present.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Checks whether a CLI flag is present.
 * @param name - Option name.
 * @returns True when the flag appears in argv.
 */
function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Reads a numeric CLI option.
 * @param name - Option name.
 * @param fallback - Fallback value when no explicit value is supplied.
 * @returns Parsed numeric option value.
 */
function numberArg(name: string, fallback: number): number {
  const value = arg(name);
  return value ? Number(value) : fallback;
}

/**
 * Reads Merrill search inputs from repeated `--query` or comma-separated `--queries`.
 * @returns Search inputs sent to the public locator feed.
 */
function queryInputs(): readonly string[] {
  const queries = process.argv
    .map((value, index) =>
      value === "--query" ? process.argv[index + 1] : undefined
    )
    .filter((value): value is string => value !== undefined);
  const csv = arg("--queries")
    ?.split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return queries.length ? queries : csv?.length ? csv : [""];
}

/**
 * Runs the Merrill locator scraper and optionally writes mapped rows.
 * @returns Resolves after all selected query inputs are fetched and reported.
 */
async function main(): Promise<void> {
  const options = runOptions();
  const rows = await collectRows(
    options.queries,
    options.maxAdvisors,
    options.pageSize,
    options.checkedAt
  );
  const counts = Object.fromEntries(
    TABLE_ORDER.map(table => [table, rows[table].length])
  );

  if (!options.json) {
    console.log(
      `[merrill] target: ${options.write ? (targetUrl() ?? describeTarget()) : "dry-run"}`
    );
  }
  const touchedCounts = Object.fromEntries(
    await Promise.all(
      TABLE_ORDER.map(async table => touchTable(table, rows, options))
    )
  );
  if (options.json) {
    console.log(
      JSON.stringify(
        { write: options.write, counts, touchedCounts, rows },
        null,
        2
      )
    );
  }
}

const touchTable = async (
  table: (typeof TABLE_ORDER)[number],
  rows: MerrillRows,
  options: ReturnType<typeof runOptions>
): Promise<readonly [string, number]> => {
  const tableRows = rows[table] as readonly Record<string, unknown>[];
  const touched = options.write
    ? await writeRows(table, tableRows)
    : tableRows.length;
  if (!options.json) {
    console.log(
      `  ${options.write ? "upsert" : "dry"} ${table}: ${tableRows.length} (${touched} ${options.write ? "touched" : "mapped"})`
    );
  }
  return [table, touched] as const;
};

const runOptions = () => ({
  write: has("--write"),
  json: has("--json"),
  maxAdvisors: numberArg("--max-advisors", DEFAULT_FIRM_SOURCE_MAX_ADVISORS),
  pageSize: Math.min(
    numberArg("--page-size", DEFAULT_FIRM_SOURCE_PAGE_SIZE),
    DEFAULT_FIRM_SOURCE_PAGE_SIZE
  ),
  checkedAt: arg("--checked-at") ?? new Date().toISOString().slice(0, 10),
  queries: queryInputs(),
});

const logAndFetchAdvisors = (
  input: string,
  maxAdvisors: number,
  pageSize: number
): ReturnType<typeof fetchAdvisors> => {
  console.error(
    `[merrill] fetching input=${JSON.stringify(input)} max=${maxAdvisors}`
  );
  return fetchAdvisors(input, maxAdvisors, pageSize);
};

const collectRows = async (
  inputs: ReadonlyArray<string>,
  maxAdvisors: number,
  pageSize: number,
  checkedAt: string
): Promise<MerrillRows> => {
  return await inputs.reduce<Promise<MerrillRows>>(async (previous, input) => {
    const advisors = await logAndFetchAdvisors(input, maxAdvisors, pageSize);
    return mergeRows(
      await previous,
      MERRILL_SOURCE_ADAPTER.mapRows(advisors, checkedAt)
    );
  }, Promise.resolve(emptyMerrillRows()));
};

const fetchAdvisors = async (
  input: string,
  maxAdvisors: number,
  pageSize: number
): Promise<ReadonlyArray<MerrillYextAdvisor>> => {
  return collectAdvisorPages({
    input,
    maxAdvisors,
    pageSize,
    offset: 0,
    total: Number.POSITIVE_INFINITY,
    advisors: [],
    seenKeys: [],
  });
};

const collectAdvisorPages = async (
  state: AdvisorPageState
): Promise<ReadonlyArray<MerrillYextAdvisor>> => {
  if (
    state.advisors.length >= state.maxAdvisors ||
    state.offset >= state.total ||
    state.offset >= MAX_YEXT_OFFSET_LIMIT
  )
    return state.advisors;
  const page = await fetchAdvisorPage(state);
  if (page.results.length === 0) return state.advisors;
  return collectAdvisorPages(mergeAdvisorPage(state, page));
};

const fetchAdvisorPage = async (
  state: AdvisorPageState
): Promise<AdvisorPage> => {
  const limit = Math.min(
    state.pageSize,
    state.maxAdvisors - state.advisors.length,
    MAX_YEXT_OFFSET_LIMIT - state.offset
  );
  const json = await fetchJson(
    MERRILL_SOURCE_ADAPTER.buildSearchUrl(state.input, limit, state.offset)
  );
  return {
    total: json.response?.resultsCount ?? 0,
    results: json.response?.results ?? [],
  };
};

const fetchJson = async (url: string): Promise<YextResponse> => {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      origin: "https://advisor.ml.com",
      referer: "https://advisor.ml.com/search",
      "user-agent": "Mozilla/5.0 advisory-rankings Merrill scraper",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Merrill Yext feed returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
    );
  }
  return (await response.json()) as YextResponse;
};

const mergeAdvisorPage = (
  state: AdvisorPageState,
  page: AdvisorPage
): AdvisorPageState => {
  const newAdvisors = page.results
    .map(result => result.data)
    .filter((advisor): advisor is MerrillYextAdvisor => Boolean(advisor))
    .filter(
      advisor =>
        Boolean(advisorKey(advisor)) &&
        !state.seenKeys.includes(advisorKey(advisor))
    )
    .slice(0, state.maxAdvisors - state.advisors.length);
  return {
    ...state,
    total: page.total,
    offset: state.offset + page.results.length,
    advisors: [...state.advisors, ...newAdvisors],
    seenKeys: [
      ...state.seenKeys,
      ...newAdvisors.map(advisorKey).filter(Boolean),
    ],
  };
};

const advisorKey = (advisor: MerrillYextAdvisor): string => {
  return String(advisor.id ?? advisor.uid ?? "");
};

const mergeTable = (
  left: ReadonlyArray<Record<string, unknown>>,
  right: ReadonlyArray<Record<string, unknown>>
): ReadonlyArray<Record<string, unknown>> => {
  return [
    ...new Map([...left, ...right].map(row => [String(row.id), row])).values(),
  ];
};

const mergeRows = (left: MerrillRows, right: MerrillRows): MerrillRows => ({
  Firm: mergeTable(left.Firm, right.Firm),
  FirmAlias: mergeTable(left.FirmAlias, right.FirmAlias),
  Branch: mergeTable(left.Branch, right.Branch),
  Advisor: mergeTable(left.Advisor, right.Advisor),
  EmploymentHistory: mergeTable(
    left.EmploymentHistory,
    right.EmploymentHistory
  ),
  Designation: mergeTable(left.Designation, right.Designation),
  Team: mergeTable(left.Team, right.Team),
  TeamMembership: mergeTable(left.TeamMembership, right.TeamMembership),
  AdvisorResearchCheck: mergeTable(
    left.AdvisorResearchCheck,
    right.AdvisorResearchCheck
  ),
});

await main();
