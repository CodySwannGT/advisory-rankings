import type { ResourceIndex } from "./resource-data.js";
import {
  advisorDisplayName,
  resolveFirm,
  type ResolvableAdvisor,
  type ResolvableFirm,
  type ResolvableTeam,
} from "./resource-routing.js";
import { normalizeState } from "./resource-rankings-explorer-utils.js";
import type {
  EmploymentHistoryRow,
  RankingEntryRow,
  RankingRow,
} from "../types/harper-schema.js";

/** Compact firm card embedded in a ranking entry's `firm` slot. */
export interface RankingFirmCard {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly url: string;
}

/** Ranking metadata bundled onto each ranking entry. */
export interface RankingPayload {
  readonly id: string | null;
  readonly publisher: string;
  readonly name: string;
  readonly year: number | null;
  readonly subjectType: string;
  readonly methodologyUrl: string | null;
}

/** Subject (advisor, team, firm, or unresolved) attached to a ranking entry. */
export interface RankingSubject {
  readonly kind: string;
  readonly id: string | null;
  readonly displayName: string;
  readonly url: string | null;
}

/** Location pair attached to a ranking entry. */
export interface RankingLocation {
  readonly city: string | null;
  readonly state: string | null;
  readonly label: string;
}

/** One score slot in `scorePayload`. */
export interface ScoreSlot {
  readonly value: number | string | null;
  readonly status: "loaded" | "unavailable";
  readonly label: string;
}

/** Score quadruple bundled onto each ranking entry. */
export interface ScorePayload {
  readonly total: ScoreSlot;
  readonly scale: ScoreSlot;
  readonly growth: ScoreSlot;
  readonly professionalism: ScoreSlot;
}

/** Numeric metrics bundled onto each ranking entry. */
export interface RankingMetrics {
  readonly aum: number | null;
  readonly productionT12: number | null;
  readonly householdCount: number | null;
  readonly teamSize: number | null;
}

/** Source attribution bundled onto each ranking entry. */
export interface RankingSource {
  readonly url: string | null;
  readonly label: string;
  readonly loadedAt: RankingEntryRow["loadedAt"] | null;
}

/** Provenance bundled onto each ranking entry. */
export interface RankingProvenance {
  readonly sourceTable: "RankingEntry";
  readonly sourceIds: readonly string[];
  readonly rankingId: string;
}

/** Private sort fields stripped before public emission. */
export interface RankingSortFields {
  readonly category: string;
  readonly firm: string;
  readonly location: string;
  readonly name: string;
  readonly rank: number;
  readonly scale: number;
  readonly growth: number;
  readonly year: number;
}

/**
 * Internal ranking entry view consumed by the rankings explorer pipeline.
 * The `_sort` block is private and stripped by `publicEntry` before clients
 * see the payload.
 */
export interface RankingExplorerEntry {
  readonly id: string;
  readonly ranking: RankingPayload;
  readonly rank: number | null;
  readonly subject: RankingSubject;
  readonly firm: RankingFirmCard | null;
  readonly firmText: string | null;
  readonly location: RankingLocation;
  readonly scores: ScorePayload;
  readonly metrics: RankingMetrics;
  readonly source: RankingSource;
  readonly resolutionStatus: string;
  readonly sourceStatus: readonly string[];
  readonly provenance: RankingProvenance;
  readonly _sort: RankingSortFields;
}

/**
 * Hydrates each stored RankingEntryRow into the rich RankingExplorerEntry shape consumed by the
 * explorer endpoints, joining in ranking metadata, subject resolution, firm cards, and sort keys.
 * @param db Resource index providing the lookup maps used during hydration.
 * @returns The list of explorer entries, in source order.
 */
export function rankingEntries(
  db: ResourceIndex
): readonly RankingExplorerEntry[] {
  return (db.rankingEntries || []).map(row => {
    const ranking = db.byRanking.get(row.rankingId) || null;
    const subject = entrySubject(db, row, ranking);
    const firm = entryFirm(db, row);
    const location: RankingLocation = {
      city: row.city || null,
      state: normalizeState(row.state),
      label: [row.city, normalizeState(row.state)].filter(Boolean).join(", "),
    };
    return {
      id: row.id,
      ranking: rankingPayload(ranking, row),
      rank: row.rank ?? null,
      subject,
      firm,
      firmText: row.firmText || firm?.name || null,
      location,
      scores: scorePayload(row),
      metrics: rankingMetrics(row),
      source: {
        url: row.sourceUrl || ranking?.methodologyUrl || null,
        label: row.sourceLabel || ranking?.name || "Ranking source",
        loadedAt: row.loadedAt || null,
      },
      resolutionStatus: resolutionStatus(row, subject),
      sourceStatus: sourceStatus(row, subject, firm, location),
      provenance: {
        sourceTable: "RankingEntry",
        sourceIds: [row.id],
        rankingId: row.rankingId,
      },
      _sort: rankingSortFields(row, ranking, subject, firm, location),
    };
  });
}

/**
 * Builds private sort keys for one explorer entry.
 * @param row - Stored ranking entry row.
 * @param ranking - Joined ranking metadata.
 * @param subject - Resolved ranking subject.
 * @param firm - Joined firm card.
 * @param location - Normalized location payload.
 * @returns Private sort fields stripped before public delivery.
 */
function rankingSortFields(
  row: RankingEntryRow,
  ranking: RankingRow | null,
  subject: RankingSubject,
  firm: RankingFirmCard | null,
  location: RankingLocation
): RankingSortFields {
  return {
    category: ranking?.name || "",
    firm: row.firmText || firm?.name || "",
    growth: numericSort(row.scoreGrowth),
    location: location.label || "",
    name: subject.displayName || row.rawDisplayName || "",
    rank: numericSort(row.rank),
    scale: numericSort(row.scoreScale),
    year: ranking?.year || 0,
  };
}

/**
 * Extracts ranking scale metrics from a stored entry row.
 * @param row Source RankingEntry row.
 * @returns Numeric ranking metrics with nulls for absent values.
 */
function rankingMetrics(row: RankingEntryRow): RankingMetrics {
  return {
    aum: row.aum ?? null,
    productionT12: row.productionT12 ?? null,
    householdCount: row.householdCount ?? null,
    teamSize: row.teamSize ?? null,
  };
}

/**
 * Composes the public-facing RankingPayload from the joined ranking metadata and the source row,
 * filling in safe defaults whenever the ranking isn't found.
 * @param ranking Joined ranking row, or null when unresolved.
 * @param row Source RankingEntry row.
 * @returns The compact ranking payload.
 */
function rankingPayload(
  ranking: RankingRow | null,
  row: RankingEntryRow
): RankingPayload {
  return {
    id: ranking?.id || row.rankingId || null,
    publisher: ranking?.publisher || "AdvisorHub",
    name: ranking?.name || "Unknown ranking",
    year: ranking?.year ?? null,
    subjectType: ranking?.subjectType || inferredSubjectType(row),
    methodologyUrl: ranking?.methodologyUrl || null,
  };
}

/**
 * Resolves the row's subject by preferring advisor → team → firm references, falling back to a raw
 * display name when no canonical entity is known.
 * @param db Resource index used for lookups.
 * @param row Source RankingEntry row.
 * @param ranking Joined ranking row used to infer subject kind on fallback.
 * @returns The resolved subject descriptor.
 */
function entrySubject(
  db: ResourceIndex,
  row: RankingEntryRow,
  ranking: RankingRow | null
): RankingSubject {
  const advisor: ResolvableAdvisor | undefined = row.subjectAdvisorId
    ? db.byAdvisor.get(row.subjectAdvisorId)
    : undefined;
  if (advisor)
    return resolvedSubject(
      "advisor",
      advisor.id,
      advisorDisplayName(advisor),
      advisor.slug
    );
  const team: ResolvableTeam | undefined = row.subjectTeamId
    ? db.byTeam.get(row.subjectTeamId)
    : undefined;
  if (team) return resolvedSubject("team", team.id, team.name, team.slug);
  const firm: ResolvableFirm | undefined = row.subjectFirmId
    ? db.byFirm.get(row.subjectFirmId)
    : undefined;
  if (firm) return resolvedSubject("firm", firm.id, firm.name, firm.slug);
  return {
    kind: ranking?.subjectType || inferredSubjectType(row),
    id: null,
    displayName: row.rawDisplayName || "Unresolved ranking row",
    url: null,
  };
}

/**
 * Builds a canonical linked ranking subject.
 * @param kind - Subject entity kind.
 * @param id - Canonical subject id.
 * @param displayName - Public subject display name.
 * @param slug - Optional route slug.
 * @returns Ranking subject descriptor.
 */
function resolvedSubject(
  kind: "advisor" | "firm" | "team",
  id: string,
  displayName: string,
  slug: string | null | undefined
): RankingSubject {
  return {
    kind,
    id,
    displayName,
    url: `/${kind}.html?id=${encodeURIComponent(slug || id)}`,
  };
}

/**
 * Resolves the firm card for a ranking entry, preferring explicit subject/firm ids, then a free-text
 * firm name, then the advisor's most-recent employment.
 * @param db Resource index used for lookups.
 * @param row Source RankingEntry row.
 * @returns The firm card, or null when no firm could be resolved.
 */
function entryFirm(
  db: ResourceIndex,
  row: RankingEntryRow
): RankingFirmCard | null {
  if (row.subjectFirmId) return firmPayload(db.byFirm.get(row.subjectFirmId));
  if (row.firmId) return firmPayload(db.byFirm.get(row.firmId));
  if (row.firmText) return firmPayload(resolveFirm(db, row.firmText));
  const advisorEmployment: EmploymentHistoryRow | undefined =
    row.subjectAdvisorId
      ? db.employments
          .filter(employment => employment.advisorId === row.subjectAdvisorId)
          .slice()
          .sort(dateDesc("startDate"))[0]
      : undefined;
  return firmPayload(
    advisorEmployment ? db.byFirm.get(advisorEmployment.firmId) : null
  );
}

/**
 * Converts a resolved firm into its compact card representation, or null when no firm exists.
 * @param firm Resolved firm row, or null/undefined when missing.
 * @returns The card, or null when no firm was provided.
 */
function firmPayload(
  firm: ResolvableFirm | null | undefined
): RankingFirmCard | null {
  return firm
    ? {
        id: firm.id,
        name: firm.name,
        short: firm.short || firm.name,
        url: `/firm.html?id=${encodeURIComponent(firm.slug || firm.id)}`,
      }
    : null;
}

/**
 * Builds the four-slot score payload from the row's raw score columns.
 * @param row Source RankingEntry row.
 * @returns The structured score quadruple.
 */
function scorePayload(row: RankingEntryRow): ScorePayload {
  return {
    total: valueState(row.scoreTotal),
    scale: valueState(row.scoreScale),
    growth: valueState(row.scoreGrowth),
    professionalism: valueState(row.scoreProfessionalism),
  };
}

/**
 * Wraps a raw score value in the loaded/unavailable state object the UI renders.
 * @param value Raw score value.
 * @returns A score slot indicating availability.
 */
function valueState(value: number | string | null | undefined): ScoreSlot {
  return value == null || value === ""
    ? { value: null, status: "unavailable", label: "Unavailable" }
    : { value, status: "loaded", label: String(value) };
}

/**
 * Derives the entry's resolution status: `resolved` when a canonical subject id exists, otherwise the
 * row's stored status (with a safe `unresolved` default).
 * @param row Source RankingEntry row.
 * @param subject Resolved subject descriptor.
 * @returns The resolution-status string.
 */
function resolutionStatus(
  row: RankingEntryRow,
  subject: RankingSubject | null
): string {
  if (subject?.id) return "resolved";
  return row.resolutionStatus || "unresolved";
}

/**
 * Computes the source-status code list, emitting one code per missing/unresolved aspect of the row.
 * @param row Source RankingEntry row.
 * @param subject Resolved subject descriptor.
 * @param firm Resolved firm card.
 * @param location Resolved location pair.
 * @returns Ordered list of status codes (empty when nothing is missing).
 */
function sourceStatus(
  row: RankingEntryRow,
  subject: RankingSubject | null,
  firm: RankingFirmCard | null,
  location: RankingLocation
): readonly string[] {
  return [
    row.sourceUrl ? "source-backed" : "missing-source",
    subject?.id ? null : "unresolved-entity",
    firm ? null : "unresolved-firm",
    location.state ? null : "missing-state",
    row.scoreScale == null ? "missing-scale" : null,
    row.scoreGrowth == null ? "missing-growth" : null,
  ].filter((status): status is string => Boolean(status));
}

/**
 * Picks a default subject-type label based on which subject id column the row populates.
 * @param row Source RankingEntry row.
 * @returns `firm`, `team`, or `advisor` (the default).
 */
function inferredSubjectType(row: RankingEntryRow): string {
  if (row.subjectFirmId) return "firm";
  if (row.subjectTeamId) return "team";
  return "advisor";
}

/**
 * Converts an unknown value to a number suitable for sort comparators, mapping non-finite values to
 * +Infinity so they sort to the end.
 * @param value Raw value.
 * @returns A finite number, or +Infinity for missing/invalid input.
 */
function numericSort(value: number | string | null | undefined): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}

/**
 * Builds a comparator that sorts rows by the given string-keyed date field in descending order, using
 * lexicographic comparison appropriate for ISO date strings.
 * @param field Field name to sort by.
 * @returns A comparator function.
 */
function dateDesc<
  TField extends string,
  TRow extends { readonly [K in TField]?: unknown },
>(field: TField): (left: TRow, right: TRow) => number {
  return (left, right) =>
    String(right?.[field] || "").localeCompare(String(left?.[field] || ""));
}
