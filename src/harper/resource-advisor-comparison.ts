import { advisorProfilePayload } from "./resource-advisor.js";
import { loadTables } from "./resource-data.js";
import { ADVISOR_COMPARISON_TABLES } from "./resource-analytics-table-sets.js";
import { normalizeId, resolveAdvisor } from "./resource-routing.js";
import type { ResourceIndex } from "./resource-data.js";
import type { RouteError } from "./resource-profile-endpoints-types.js";
import type { RouteTarget } from "../types/harper-resource.js";
import type { AdvisorProfilePayload } from "../types/advisor-profile.js";
import type {
  AdvisorComparisonAssertion,
  AdvisorComparisonAttribution,
  AdvisorComparisonDataConfidence,
  AdvisorComparisonItem,
  AdvisorComparisonNotFoundItem,
  AdvisorComparisonPayload,
  AdvisorComparisonRanking,
  AdvisorComparisonRegulatory,
  AdvisorComparisonResearchSource,
  AdvisorComparisonSelection,
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

/** De-duplicated comparison ids and duplicate markers. */
interface DedupedComparisonIds {
  readonly normalizedIds: ReadonlyArray<string>;
  readonly duplicateIds: ReadonlyArray<string>;
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
    const selection = comparisonSelection(target);
    // Builds up to four full advisor profiles plus ranking/assertion
    // overlays; the read is scoped to the tables `advisorProfilePayload`
    // and `comparisonItem` consume instead of the legacy `loadAll()`.
    const db = await loadTables(ADVISOR_COMPARISON_TABLES);
    const advisors = selection.cappedIds.map(id => ({
      id,
      advisor: resolveAdvisor(db, id),
    }));

    return {
      generatedAt: new Date().toISOString(),
      selection: {
        ...selection,
        missingIds: advisors.filter(row => !row.advisor).map(row => row.id),
      },
      count: advisors.length,
      ids: advisors.map(row => row.advisor?.id ?? row.id),
      items: advisors.map(row =>
        row.advisor
          ? comparisonItem(db, advisorProfilePayload(db, row.advisor))
          : notFoundComparisonItem(row.id)
      ),
    };
  }
}

/**
 * Reads comparison advisor IDs from `ids`, `advisorIds`, repeated `id`, or path.
 * @param target - Harper route target.
 * @returns Advisor identifiers in request order.
 */
function requestedComparisonIds(
  target: RouteTarget | undefined
): readonly string[] {
  const values = [
    ...paramValues(target, "ids"),
    ...paramValues(target, "advisorIds"),
    ...paramValues(target, "id"),
  ];
  const rawIds = values.length ? values : [normalizeId(target)];
  return rawIds.flatMap(splitIds).filter(Boolean);
}

/**
 * Builds a stable comparison selection summary from raw request IDs.
 * @param target - Harper route target.
 * @returns Normalized and capped comparison selection metadata.
 */
function comparisonSelection(
  target: RouteTarget | undefined
): AdvisorComparisonSelection {
  const requestedIds = requestedComparisonIds(target);
  const { normalizedIds, duplicateIds } = dedupeIds(requestedIds);
  const cappedIds = normalizedIds.slice(0, MAX_ADVISOR_COUNT);
  return {
    status: selectionStatus(normalizedIds.length),
    requestedIds,
    normalizedIds,
    duplicateIds,
    cappedIds,
    missingIds: [],
    min: MIN_ADVISOR_COUNT,
    max: MAX_ADVISOR_COUNT,
    truncated: normalizedIds.length > MAX_ADVISOR_COUNT,
  };
}

/**
 * De-duplicates IDs without changing the order users supplied.
 * @param ids - Raw requested IDs.
 * @returns Unique IDs and duplicate IDs in first duplicate encounter order.
 */
function dedupeIds(ids: readonly string[]): DedupedComparisonIds {
  const normalizedIds = [...new Set(ids)];
  const duplicateIds = [
    ...new Set(ids.filter((id, index) => ids.indexOf(id) !== index)),
  ];

  return { normalizedIds, duplicateIds };
}

/**
 * Classifies the selection count without turning recoverable states into errors.
 * @param count - Unique requested ID count.
 * @returns Selection status for the response payload.
 */
function selectionStatus(count: number): AdvisorComparisonSelection["status"] {
  if (count === 0) return "empty_selection";
  if (count < MIN_ADVISOR_COUNT) return "under_limit";
  if (count > MAX_ADVISOR_COUNT) return "over_limit";
  return "ready";
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
    status: "found",
    id: advisorId,
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
 * Builds a neutral placeholder for an unresolved comparison ID.
 * @param id - Requested advisor ID that did not resolve.
 * @returns Not-found comparison item.
 */
function notFoundComparisonItem(id: string): AdvisorComparisonNotFoundItem {
  return {
    status: "not_found",
    id,
    identity: null,
    displayName: id,
    firm: null,
    regulatory: emptyRegulatory(),
    career: [],
    rankings: [],
    articles: [],
    dataConfidence: emptyDataConfidence(),
    attribution: emptyAttribution(),
  };
}

/**
 * Builds an empty regulatory block for unresolved advisors.
 * @returns Empty regulatory evidence.
 */
function emptyRegulatory(): AdvisorComparisonRegulatory {
  return {
    brokerCheckSnapshot: null,
    disclosures: [],
    disclosureCount: 0,
    registrationApplications: [],
  };
}

/**
 * Builds an empty confidence block for unresolved advisors.
 * @returns Empty confidence signals.
 */
function emptyDataConfidence(): AdvisorComparisonDataConfidence {
  return {
    evidenceFreshness: {
      hasData: false,
      lastCheckedAt: null,
      nearestNextCheckAfter: null,
      statusCounts: { success: 0, no_new_data: 0, ambiguous: 0, failed: 0 },
      sourceTypeCoverage: {
        web_research: 0,
        firm_bio: 0,
        rankings: 0,
        press: 0,
      },
    },
    confidenceSummary: {
      hasData: false,
      asserted: 0,
      inferred: 0,
      derived: 0,
      total: 0,
    },
  };
}

/**
 * Builds an empty attribution block for unresolved advisors.
 * @returns Empty source attribution.
 */
function emptyAttribution(): AdvisorComparisonAttribution {
  return {
    brokerCheck: null,
    articles: [],
    assertions: [],
    researchSources: [],
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
