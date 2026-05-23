/**
 * Firm-source adapters ingest public locator data into the same Harper tables
 * regardless of the firm's feed shape. The contract keeps future scrapers
 * compatible with the Morgan Stanley importer without coupling them to Yext.
 * @module firm-source-adapter
 */

/** Harper tables that firm locator adapters are expected to produce. */
export const FIRM_SOURCE_TABLES = [
  "Firm",
  "FirmAlias",
  "Branch",
  "Advisor",
  "EmploymentHistory",
  "Designation",
  "Team",
  "TeamMembership",
  "AdvisorResearchCheck",
] as const;

/** Harper row bundle produced by a firm-source adapter. */
class FirmSourceRows {
  readonly Firm: ReadonlyArray<Record<string, unknown>> = [];
  readonly FirmAlias: ReadonlyArray<Record<string, unknown>> = [];
  readonly Branch: ReadonlyArray<Record<string, unknown>> = [];
  readonly Advisor: ReadonlyArray<Record<string, unknown>> = [];
  readonly EmploymentHistory: ReadonlyArray<Record<string, unknown>> = [];
  readonly Designation: ReadonlyArray<Record<string, unknown>> = [];
  readonly Team: ReadonlyArray<Record<string, unknown>> = [];
  readonly TeamMembership: ReadonlyArray<Record<string, unknown>> = [];
  readonly AdvisorResearchCheck: ReadonlyArray<Record<string, unknown>> = [];
}

export const FIRM_SOURCE_SAMPLE_LIMIT = 5;

/**
 * Builds the script name used by package.json for firm locator importers.
 * @param firmSlug - Lowercase, hyphenated firm identifier.
 * @returns The package script name for the firm scraper.
 */
export function firmSourceScriptName(firmSlug: string): string {
  return `scrape:${firmSlug}`;
}

/**
 * Builds the TypeScript script file path for a firm locator importer.
 * @param firmSlug - Lowercase, hyphenated firm identifier.
 * @returns The expected script path under src/scripts.
 */
export function firmSourceScriptPath(firmSlug: string): string {
  return `src/scripts/scrape_${firmSlug.replaceAll("-", "_")}.ts`;
}

/**
 * Builds the fixture directory path used by parser and normalizer tests.
 * @param firmSlug - Lowercase, hyphenated firm identifier.
 * @returns The expected fixture directory under tests/fixtures.
 */
export function firmSourceFixtureDir(firmSlug: string): string {
  return `tests/fixtures/firm-sources/${firmSlug}`;
}

/**
 * Creates empty row arrays for every table a firm-source adapter can emit.
 * @returns Empty rows keyed by Harper table name.
 */
export function emptyFirmSourceRows(): FirmSourceRows {
  return {
    Firm: [],
    FirmAlias: [],
    Branch: [],
    Advisor: [],
    EmploymentHistory: [],
    Designation: [],
    Team: [],
    TeamMembership: [],
    AdvisorResearchCheck: [],
  };
}
