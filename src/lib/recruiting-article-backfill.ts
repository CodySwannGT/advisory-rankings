import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { buildRows, type BuiltRows } from "../scripts/load_extractions.js";
import {
  asRecord,
  extractionRows,
  stringValue,
  summarizeUpserts,
  type Row,
} from "../scripts/load_extractions_helpers.js";

const DEFAULT_SOURCE_DIR = "research/extractions";
const DEFAULT_ARTIFACT = "artifacts/recruiting-backfill-summary.json";
const ADVISORHUB_HOST = "www.advisorhub.com";

/** Options accepted by the recruiting article backfill runner. */
interface RecruitingArticleBackfillOptions {
  readonly sourceDir?: string;
  readonly limit: number;
  readonly dryRun: boolean;
  readonly artifactPath?: string;
}

/** Summary emitted for one checked source file. */
interface RecruitingArticleBackfillFileSummary {
  readonly file: string;
  readonly status: "loaded" | "skipped";
  readonly reason?: string;
  readonly articleCount: number;
  readonly moveCount: number;
  readonly unresolvedCount: number;
  readonly upserts: Readonly<Record<string, unknown>>;
}

/** Operator-facing summary artifact for a bounded backfill run. */
interface RecruitingArticleBackfillSummary {
  readonly sourceDir: string;
  readonly limit: number;
  readonly dryRun: boolean;
  readonly checkedCount: number;
  readonly loadedCount: number;
  readonly skippedCount: number;
  readonly articleCount: number;
  readonly moveCount: number;
  readonly unresolvedCount: number;
  readonly files: readonly RecruitingArticleBackfillFileSummary[];
}

/** Eligibility verdict for one extraction payload. */
interface RecruitingEligibility {
  readonly eligible: boolean;
  readonly reason?: string;
}

/**
 * Runs a bounded recruiting article extraction backfill and writes a summary artifact.
 * @param options - Source directory, explicit limit, write mode, and artifact destination.
 * @returns Summary matching the artifact content.
 */
export async function runRecruitingArticleBackfill(
  options: RecruitingArticleBackfillOptions
): Promise<RecruitingArticleBackfillSummary> {
  if (!Number.isInteger(options.limit) || options.limit <= 0)
    throw new Error("--limit must be a positive integer");
  const sourceDir = options.sourceDir ?? DEFAULT_SOURCE_DIR;
  const artifactPath = options.artifactPath ?? DEFAULT_ARTIFACT;
  const files = await candidateFiles(sourceDir, options.limit);
  const summaries = await Promise.all(
    files.map(file => processFile(file, options.dryRun))
  );
  const summary = summarizeRun(sourceDir, options, summaries);
  await writeSummaryArtifact(artifactPath, summary);
  return summary;
}

/**
 * Lists candidate JSON files in stable bounded order.
 * @param sourceDir - Directory containing extraction JSON payloads.
 * @param limit - Maximum number of files to inspect.
 * @returns Absolute or relative paths suitable for reading.
 */
async function candidateFiles(
  sourceDir: string,
  limit: number
): Promise<readonly string[]> {
  if (!existsSync(sourceDir)) return [];
  return (await readdir(sourceDir))
    .filter(file => file.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit)
    .map(file => join(sourceDir, file));
}

/**
 * Processes a single extraction payload.
 * @param file - Extraction JSON file path.
 * @param dryRun - When true, count rows without writing to Harper.
 * @returns Per-file summary.
 */
async function processFile(
  file: string,
  dryRun: boolean
): Promise<RecruitingArticleBackfillFileSummary> {
  const extraction = JSON.parse(await readFile(file, "utf8")) as unknown;
  const eligibility = recruitingEligibility(extraction);
  if (!eligibility.eligible) {
    return {
      file,
      status: "skipped",
      reason: eligibility.reason,
      articleCount: 0,
      moveCount: 0,
      unresolvedCount: 0,
      upserts: {},
    };
  }
  const rows = buildRows(extraction);
  const upserts = await summarizeUpserts(rows, dryRun);
  return {
    file,
    status: "loaded",
    articleCount: rows.Article.length,
    moveCount: rows.TransitionEvent.length,
    unresolvedCount: unresolvedMoveCount(rows),
    upserts,
  };
}

/**
 * Determines whether an extraction is a public AdvisorHub recruiting candidate.
 * @param extraction - Parsed extraction JSON.
 * @returns Eligibility verdict with skip reason when ineligible.
 */
function recruitingEligibility(extraction: unknown): RecruitingEligibility {
  const article = asRecord(asRecord(extraction).article);
  const url = stringValue(article.url);
  if (!isAdvisorHubUrl(url))
    return { eligible: false, reason: "non_public_source" };
  const category = stringValue(article.category).toLowerCase();
  const hasRecruitingCategory = category === "recruiting";
  const hasMoves = transitionSources(asRecord(extraction)).length > 0;
  if (!hasRecruitingCategory && !hasMoves)
    return { eligible: false, reason: "not_recruiting" };
  return { eligible: true };
}

/**
 * Checks that a URL is an AdvisorHub public source URL.
 * @param value - Candidate URL.
 * @returns True when the URL belongs to AdvisorHub.
 */
function isAdvisorHubUrl(value: string): boolean {
  try {
    return new URL(value).host === ADVISORHUB_HOST;
  } catch {
    return false;
  }
}

/**
 * Collects all move-like source arrays accepted by the extraction loader.
 * @param extraction - Parsed extraction record.
 * @returns Move source rows before normalization.
 */
function transitionSources(extraction: Row): readonly Row[] {
  return [
    ...extractionRows(extraction.transition_events),
    ...extractionRows(extraction.transitions),
    ...extractionRows(extraction.comparator_transition_events),
    ...extractionRows(extraction.comparator_transitions),
    ...extractionRows(extraction.mentioned_transition_events),
  ];
}

/**
 * Counts unresolved move extraction assertions emitted by the loader.
 * @param rows - Normalized loader rows.
 * @returns Number of unresolved move rows preserved as assertions.
 */
function unresolvedMoveCount(rows: BuiltRows): number {
  return rows.FieldAssertion.filter(
    row => row.targetTable === "TransitionEventExtractionSkip"
  ).length;
}

/**
 * Builds the aggregate run summary.
 * @param sourceDir - Source directory used for the run.
 * @param options - Original run options.
 * @param files - Per-file summaries.
 * @returns Aggregate summary.
 */
function summarizeRun(
  sourceDir: string,
  options: RecruitingArticleBackfillOptions,
  files: readonly RecruitingArticleBackfillFileSummary[]
): RecruitingArticleBackfillSummary {
  return {
    sourceDir,
    limit: options.limit,
    dryRun: options.dryRun,
    checkedCount: files.length,
    loadedCount: files.filter(file => file.status === "loaded").length,
    skippedCount: files.filter(file => file.status === "skipped").length,
    articleCount: sum(files, "articleCount"),
    moveCount: sum(files, "moveCount"),
    unresolvedCount: sum(files, "unresolvedCount"),
    files,
  };
}

/**
 * Sums a numeric field over file summaries.
 * @param files - Per-file summaries.
 * @param key - Numeric field name.
 * @returns Total value.
 */
function sum(
  files: readonly RecruitingArticleBackfillFileSummary[],
  key: "articleCount" | "moveCount" | "unresolvedCount"
): number {
  return files.reduce((total, file) => total + file[key], 0);
}

/**
 * Writes the operator artifact, creating the parent directory if needed.
 * @param artifactPath - Destination JSON path.
 * @param summary - Summary to persist.
 * @returns Resolves once the artifact is written.
 */
async function writeSummaryArtifact(
  artifactPath: string,
  summary: RecruitingArticleBackfillSummary
): Promise<void> {
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(
    artifactPath,
    `${JSON.stringify({ ...summary, artifact: basename(artifactPath) }, null, 2)}\n`
  );
}
