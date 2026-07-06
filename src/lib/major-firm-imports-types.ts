/**
 * Type declarations and the firm-source table registry for the bounded
 * major-firm import runner (`major-firm-imports.ts`). Kept in a sibling
 * module so the runner file stays under the per-file line budget; these
 * types are internal to the runner and its tests.
 */

/** Firm-source tables sampled and counted by the bounded import runner. */
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

/** One firm-source table name covered by the bounded import runner. */
export type FirmSourceTable = (typeof FIRM_SOURCE_TABLES)[number];

/** Review-facing outcome of one adapter dry-run/write pair. */
export type AdapterStatus =
  | "written"
  | "mapped"
  | "write-blocked"
  | "source-limited"
  | "blocked";

/** Major firm-source adapter metadata used by the bounded import runner. */
export interface MajorFirmAdapter {
  readonly slug: string;
  readonly displayName: string;
  readonly script: string;
  readonly queries: ReadonlyArray<string>;
}

/** Runtime options for a major firm-source import run. */
export interface MajorFirmImportOptions {
  readonly checkedAt: string;
  readonly maxAdvisors: number;
  readonly outputDir: string;
  readonly sampleLimit: number;
  readonly write: boolean;
}

/** Captured output from one adapter command in dry-run or write mode. */
export interface AdapterModeArtifact {
  readonly mode: "dry-run" | "write";
  readonly command: ReadonlyArray<string>;
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly touchedCounts: Readonly<Record<string, number>>;
  readonly totalRows: number;
  readonly totalTouched: number;
  readonly sampleRows: Readonly<
    Partial<
      Record<FirmSourceTable, readonly Readonly<Record<string, unknown>>[]>
    >
  >;
  readonly error?: string;
}

/** Full audit artifact for one major firm-source adapter. */
export interface AdapterArtifact {
  readonly slug: string;
  readonly displayName: string;
  readonly queries: ReadonlyArray<string>;
  readonly status: AdapterStatus;
  readonly dryRun: AdapterModeArtifact;
  readonly writeRun?: AdapterModeArtifact;
}

/** Per-adapter summary written next to the artifacts. */
export interface MajorFirmSummaryAdapter {
  readonly slug: string;
  readonly displayName: string;
  readonly status: AdapterStatus;
  readonly dryRunRows: number;
  readonly writeTouched?: number;
  readonly artifactPath: string;
}

/** Command output captured from one adapter subprocess. */
export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

/** One written adapter artifact paired with its on-disk path. */
export interface AdapterArtifactPath {
  readonly artifact: AdapterArtifact;
  readonly artifactPath: string;
}

/** Partial command output attached to an adapter failure. */
export interface CommandFailure extends Partial<CommandResult> {
  readonly message?: string;
}

/** Top-level summary written next to the per-adapter artifacts. */
export interface MajorFirmImportSummary {
  readonly generatedAt: string;
  readonly checkedAt: string;
  readonly maxAdvisors: number;
  readonly write: boolean;
  readonly outputDir: string;
  readonly adapters: ReadonlyArray<MajorFirmSummaryAdapter>;
}

/** Injectable command runner for tests. */
export type CommandRunner = (
  command: string,
  args: ReadonlyArray<string>
) => Promise<CommandResult>;
