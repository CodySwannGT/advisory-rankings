import { advisorProfilePayload } from "./resource-advisor.js";
import { loadAll } from "./resource-data.js";
import { normalizeId, resolveAdvisor } from "./resource-routing.js";
import type { ResourceIndex } from "./resource-data.js";
import type { RouteError } from "./resource-profile-endpoints-types.js";
import type { RouteTarget } from "../types/harper-resource.js";
import type { AdvisorProfilePayload } from "../types/advisor-profile.js";
import type {
  AdvisorComparisonAssertion,
  AdvisorComparisonAttribution,
  AdvisorComparisonItem,
  AdvisorComparisonPayload,
  AdvisorComparisonRanking,
  AdvisorComparisonResearchSource,
} from "../types/advisor-comparison.js";
import type {
  AdvisorResearchCheckRow,
  FieldAssertionRow,
} from "../types/harper-schema.js";

const MIN_ADVISOR_COUNT = 2;
const MAX_ADVISOR_COUNT = 4;

/** Target shape used to read query params from Harper and local shims. */
interface ComparisonTarget {
  readonly get?: (name: string) => unknown;
  readonly getAll?: (name: string) => readonly unknown[];
}

/** Public two-to-four advisor comparison resource. */
export class AdvisorComparison extends Resource {
  /**
   * Allows anonymous readers to load source-backed comparison payloads.
   * @returns True because this resource exposes only public advisor facts.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Loads normalized public diligence sections for two to four advisors.
   * @param target - Route target carrying `ids` or repeated `id` params.
   * @returns Comparison payload or a route-style error.
   */
  async get(
    target?: RouteTarget
  ): Promise<AdvisorComparisonPayload | RouteError> {
    const ids = comparisonIds(target);
    const countError = validateAdvisorCount(ids);
    if (countError) return countError;

    const db = await loadAll();
    const advisors = ids.map(id => resolveAdvisor(db, id));
    const missing = ids.find((_, index) => !advisors[index]);
    if (missing) return { error: "not found", id: missing };

    return {
      generatedAt: new Date().toISOString(),
      count: advisors.length,
      ids: advisors.map(advisor => advisor?.id ?? ""),
      items: advisors.map(advisor =>
        comparisonItem(db, advisorProfilePayload(db, advisor!))
      ),
    };
  }
}

/**
 * Reads comparison advisor IDs from `ids`, `advisorIds`, repeated `id`, or path.
 * @param target - Harper route target.
 * @returns De-duplicated advisor identifiers in request order.
 */
function comparisonIds(target: RouteTarget | undefined): readonly string[] {
  const values = [
    ...paramValues(target, "ids"),
    ...paramValues(target, "advisorIds"),
    ...paramValues(target, "id"),
  ];
  const rawIds = values.length ? values : [normalizeId(target)];
  return [...new Set(rawIds.flatMap(splitIds).filter(Boolean))];
}

/**
 * Reads every value for one query param, tolerating minimal local shims.
 * @param target - Harper route target.
 * @param name - Query parameter name.
 * @returns String values for the parameter.
 */
function paramValues(
  target: RouteTarget | undefined,
  name: string
): readonly string[] {
  if (!target || typeof target !== "object") return [];
  const comparisonTarget = target as ComparisonTarget;
  const repeated = comparisonTarget.getAll?.(name) ?? [];
  if (repeated.length) return repeated.map(String);
  const value = comparisonTarget.get?.(name);
  return value == null ? [] : [String(value)];
}

/**
 * Splits comma-delimited id query values.
 * @param value - Raw query value.
 * @returns Individual trimmed ids.
 */
function splitIds(value: string): readonly string[] {
  return value
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);
}

/**
 * Validates the comparison's bounded advisor count.
 * @param ids - Normalized requested advisor ids.
 * @returns Route-style error, or null when count is supported.
 */
function validateAdvisorCount(ids: readonly string[]): RouteError | null {
  if (ids.length < MIN_ADVISOR_COUNT) {
    return {
      error: "at least two advisor ids required",
      items: [],
      nextCursor: null,
    };
  }
  if (ids.length > MAX_ADVISOR_COUNT) {
    return {
      error: "at most four advisor ids supported",
      items: [],
      nextCursor: null,
    };
  }
  return null;
}

/**
 * Builds one normalized advisor column from existing profile primitives.
 * @param db - Preloaded resource index.
 * @param profile - Existing advisor profile payload.
 * @returns Comparison item for one advisor.
 */
function comparisonItem(
  db: ResourceIndex,
  profile: AdvisorProfilePayload
): AdvisorComparisonItem {
  const advisorId = profile.advisor.id;
  return {
    identity: profile.advisor,
    displayName: profile.displayName,
    firm: currentFirm(profile),
    regulatory: {
      brokerCheckSnapshot: profile.brokerCheckSnapshot,
      disclosures: profile.disclosures,
      disclosureCount: profile.disclosures.length,
      registrationApplications: profile.registrationApplications,
    },
    career: profile.career,
    rankings: advisorRankings(db, advisorId),
    articles: profile.articles,
    dataConfidence: {
      evidenceFreshness: profile.evidenceFreshness,
      confidenceSummary: profile.confidenceSummary,
    },
    attribution: attribution(db, profile),
  };
}

/**
 * Picks the current firm chip from the advisor career timeline.
 * @param profile - Advisor profile payload.
 * @returns Current firm chip, latest known firm chip, or null.
 */
function currentFirm(profile: AdvisorProfilePayload): unknown {
  const current = profile.career.find(row => !row.endDate);
  return (current ?? profile.career.at(-1))?.firm ?? null;
}

/**
 * Collects ranking rows for an advisor with ranking-list metadata attached.
 * @param db - Preloaded resource index.
 * @param advisorId - Advisor id to match.
 * @returns Ranking entries in rank/source order.
 */
function advisorRankings(
  db: ResourceIndex,
  advisorId: string
): readonly AdvisorComparisonRanking[] {
  return db.rankingEntries
    .filter(entry => entry.subjectAdvisorId === advisorId)
    .slice()
    .sort(compareRankingEntries)
    .map(entry => ({
      entry,
      ranking: db.byRanking.get(entry.rankingId) ?? null,
    }));
}

/**
 * Sorts ranking entries deterministically for comparison display.
 * @param left - Left ranking entry.
 * @param right - Right ranking entry.
 * @returns Stable numeric comparison.
 */
function compareRankingEntries(
  left: AdvisorComparisonRanking["entry"],
  right: AdvisorComparisonRanking["entry"]
): number {
  return (
    compareNullableNumber(left.rank, right.rank) ||
    String(left.sourceLabel ?? "").localeCompare(
      String(right.sourceLabel ?? "")
    ) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Compares optional numbers with missing values last.
 * @param left - Left number.
 * @param right - Right number.
 * @returns Stable numeric comparison.
 */
function compareNullableNumber(
  left: number | undefined,
  right: number | undefined
): number {
  if (left === right) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

/**
 * Builds public source attribution for one advisor.
 * @param db - Preloaded resource index.
 * @param profile - Existing advisor profile payload.
 * @returns BrokerCheck, article, assertion, and source-check attribution.
 */
function attribution(
  db: ResourceIndex,
  profile: AdvisorProfilePayload
): AdvisorComparisonAttribution {
  const advisorId = profile.advisor.id;
  return {
    brokerCheck: profile.brokerCheckSnapshot,
    articles: profile.articles,
    assertions: db.fieldAssertions
      .filter(field => isAdvisorAssertion(field, advisorId))
      .map(assertionRow),
    researchSources: db.researchChecks
      .filter(check => check.advisorId === advisorId)
      .map(researchSourceRow),
  };
}

/**
 * Checks whether a field assertion belongs to the advisor target.
 * @param field - Candidate field assertion.
 * @param advisorId - Advisor id to match.
 * @returns True when the assertion targets the advisor.
 */
function isAdvisorAssertion(
  field: FieldAssertionRow,
  advisorId: string
): boolean {
  return (
    String(field.targetTable ?? "").toLowerCase() === "advisor" &&
    field.targetId === advisorId
  );
}

/**
 * Converts field assertions to compact comparison attribution rows.
 * @param field - Field assertion row.
 * @returns Public assertion attribution row.
 */
function assertionRow(field: FieldAssertionRow): AdvisorComparisonAssertion {
  return {
    articleId: field.articleId,
    fieldName: field.fieldName,
    assertedValue: field.assertedValue,
    quotePhrase: field.quotePhrase,
    confidence: field.confidence,
  };
}

/**
 * Converts research-check rows to public source-check attribution rows.
 * @param check - Advisor research check row.
 * @returns Public research source row.
 */
function researchSourceRow(
  check: AdvisorResearchCheckRow
): AdvisorComparisonResearchSource {
  return {
    sourceType: check.sourceType,
    status: check.status,
    checkedAt: check.checkedAt,
    sourcesChecked: check.sourcesChecked ?? [],
  };
}
