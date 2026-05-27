/**
 * Pure helpers and shared types for the Morgan Stanley locator scraper.
 * @module scrape_morgan_stanley_helpers
 */
import type { MorganStanleyYextLocation } from "../lib/morgan-stanley-types.js";

/** Yext response payload that wraps the locator results. */
export interface YextResponsePayload {
  readonly resultsCount?: number;
  readonly results?: ReadonlyArray<YextResult>;
}

/** Single Yext result entry containing a raw location data object. */
export interface YextResult {
  readonly data?: unknown;
}

/** Yext response envelope returned by the Morgan Stanley locator API. */
export interface YextResponse {
  readonly response?: YextResponsePayload;
}

/** Fabric operation response returned by the Studio cluster API. */
export interface FabricResponse {
  readonly status: number;
  readonly body: unknown;
}

/** One fetched Yext page plus its total result count. */
export interface LocationPage {
  readonly total: number;
  readonly results: ReadonlyArray<YextResult>;
}

/** Pagination accumulator used while walking the Yext result window. */
export interface LocationPageState {
  readonly input: string;
  readonly maxAdvisors: number;
  readonly pageSize: number;
  readonly offset: number;
  readonly total: number;
  readonly locations: ReadonlyArray<MorganStanleyYextLocation>;
  readonly seenKeys: ReadonlyArray<string>;
}

/**
 * Reads the value following the named CLI flag in `process.argv`.
 * @param name - CLI flag name (for example `--write`).
 * @returns The argument value if present, otherwise undefined.
 */
export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Returns whether the named CLI flag is present in `process.argv`.
 * @param name - CLI flag name (for example `--write`).
 * @returns True when the flag is present.
 */
export function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Reads a CLI flag value as a number, falling back when omitted.
 * @param name - CLI flag name (for example `--max-advisors`).
 * @param fallback - Numeric fallback when the flag is absent.
 * @returns The parsed numeric value.
 */
export function numberArg(name: string, fallback: number): number {
  const value = arg(name);
  return value ? Number(value) : fallback;
}

/**
 * Collects locator search inputs from `--query` and `--queries` CLI flags.
 * @returns The parsed list of search inputs, defaulting to a single blank.
 */
export function queryInputs(): readonly string[] {
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
 * Returns the unique key for a Morgan Stanley Yext location row.
 * @param location - Yext location entry.
 * @returns Stable string key built from uid/id fields.
 */
export const locationKey = (location: MorganStanleyYextLocation): string => {
  return String(location.uid ?? location.id ?? "");
};

/**
 * Removes any trailing slashes from a URL or path-like string.
 * @param value - Input string.
 * @returns The input with trailing slashes removed.
 */
export const stripTrailingSlashes = (value: string): string => {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
};

/**
 * Splits a record array into fixed-size batches for bulk upsert.
 * @param records - The records to partition.
 * @param size - Maximum batch size.
 * @returns A list of read-only batches.
 */
export const batches = (
  records: ReadonlyArray<Record<string, unknown>>,
  size: number
): ReadonlyArray<ReadonlyArray<Record<string, unknown>>> => {
  return records.length
    ? [records.slice(0, size), ...batches(records.slice(size), size)]
    : [];
};
