/* eslint-disable jsdoc/require-jsdoc -- Private helper names are descriptive and kept local to this resource module. */

import type { HarperDate } from "../types/harper-schema.js";
import type {
  BrokerCheckSource,
  FreshnessNote,
  RankingAppearance,
} from "./resource-firm-due-diligence-types.js";

const BROKERCHECK_TERMS_URL = "https://brokercheck.finra.org/terms";
const BROKERCHECK_SOURCE_URL = "https://brokercheck.finra.org/";

export function freshnessNote(
  date: HarperDate | string | null,
  fallback: string
): FreshnessNote {
  return date
    ? { status: "loaded", asOf: date, note: "Source timestamp loaded." }
    : {
        status: "unavailable",
        asOf: null,
        note: fallback,
      };
}

export function dateDesc<K extends string>(
  field: K
): (
  left: Readonly<Partial<Record<K, HarperDate | null | undefined>>>,
  right: Readonly<Partial<Record<K, HarperDate | null | undefined>>>
) => number {
  return (left, right) =>
    String(right?.[field] ?? "").localeCompare(String(left?.[field] ?? ""));
}

export function latestDate<K extends string>(
  rows: readonly Readonly<Partial<Record<K, HarperDate | null | undefined>>>[],
  field: K
): HarperDate | null {
  const values = rows
    .map(row => row?.[field])
    .filter((value): value is HarperDate => Boolean(value));
  return values.slice().sort(compareHarperDateAsc).at(-1) ?? null;
}

function compareHarperDateAsc(a: HarperDate, b: HarperDate): number {
  return String(a).localeCompare(String(b));
}

export function transitionFirmId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const id = Reflect.get(value, "id");
  return typeof id === "string" ? id : null;
}

export function latestRankingYear(
  appearances: readonly RankingAppearance[]
): string | null {
  const years = appearances
    .map(row => row.ranking?.year)
    .filter((value): value is number => value != null && Number.isFinite(value))
    .slice()
    .sort((left, right) => left - right);
  const year = years.at(-1);
  return year != null ? String(year) : null;
}

export function brokerCheckSource(
  fetchedAt: HarperDate | null,
  subjectCrd: string | null
): BrokerCheckSource {
  return {
    sourceName: "FINRA BrokerCheck",
    sourceUrl: subjectCrd
      ? `${BROKERCHECK_SOURCE_URL}firm/summary/${encodeURIComponent(subjectCrd)}`
      : BROKERCHECK_SOURCE_URL,
    termsUrl: BROKERCHECK_TERMS_URL,
    compiledAsOf: fetchedAt ?? null,
  };
}

/* eslint-enable jsdoc/require-jsdoc -- End local private-helper exception. */
