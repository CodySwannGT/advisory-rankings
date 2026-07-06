/**
 * Per-request scoped loader for `/TeamProfile/<id>`. Replaces the
 * request-wide `loadAll()` 34-table scan with reads keyed by the
 * subject team: memberships, snapshots, and transitions come from
 * indexed foreign-key lookups; members, firms, branches, deals, and
 * mentioned articles are hydrated by primary key. The
 * `ArticleTeamMention` join table is deliberately scanned — see
 * `resource-profile-scoped-load.ts` for the Fabric secondary-index
 * replication rationale.
 */
import type {
  ArticleRow,
  ArticleTeamMentionRow,
  BranchRow,
  FirmAliasRow,
  RecruitingDealQuoteRow,
  TeamMembershipRow,
  TeamMetricSnapshotRow,
  TeamRow,
  TransitionEventRow,
} from "../types/harper-schema.js";

import {
  buildScopedResourceIndex,
  type ResourceIndex,
  type ResourceTableRows,
} from "./resource-data.js";
import { optionalAll } from "./resource-directory-tables.js";
import { resolveTeam } from "./resource-routing.js";
import {
  advisorsByIdsBounded,
  distinctIds,
  firmsByIdsWithCanonical,
  optionalRowsByAttribute,
  rowsByIdsOptional,
  scanRowsWhere,
  subjectCandidates,
} from "./resource-profile-scoped-load.js";

const TEAM_ID_ATTR = "teamId";

/**
 * Loads the subject-scoped resource index for one team profile request.
 * The candidates pass through `buildScopedResourceIndex`, which applies
 * the same public team-name cleanup and firm canonicalization as
 * `loadAll()`, so `resolveTeam` (id or slug over cleaned names) and
 * `teamProfilePayload` behave identically.
 * @param identifier - Route id or slug for the team.
 * @returns Scoped `ResourceIndex` (no related rows when the team does
 *   not resolve, so the caller 404s consistently).
 */
export async function loadTeamProfileIndex(
  identifier: string
): Promise<ResourceIndex> {
  const teams = await subjectCandidates<TeamRow>(tables.Team, identifier);
  const team = resolveTeam(buildScopedResourceIndex({ teams }), identifier);
  if (!team) return buildScopedResourceIndex({ teams });
  const related = await loadTeamRelatedRows(team);
  return buildScopedResourceIndex({ teams, ...related });
}

/** Rows fetched directly off the subject team id. */
interface TeamDirectRows {
  readonly memberships: readonly TeamMembershipRow[];
  readonly teamSnaps: readonly TeamMetricSnapshotRow[];
  readonly transitions: readonly TransitionEventRow[];
  readonly mTeam: readonly ArticleTeamMentionRow[];
}

/**
 * Fetches every table the team profile reads keyed by the team id,
 * then hydrates the rows those tables reference.
 * @param team - Resolved subject team row.
 * @returns Scoped table rows for `buildScopedResourceIndex`.
 */
async function loadTeamRelatedRows(
  team: TeamRow
): Promise<Partial<ResourceTableRows>> {
  const direct = await loadTeamDirectRows(team.id);
  const referenced = await loadTeamReferencedRows(team, direct);
  return { ...direct, ...referenced };
}

/**
 * Fetches the tables that carry the team id as an indexed foreign key,
 * plus the scan-only `ArticleTeamMention` table.
 * @param teamId - Resolved subject team id.
 * @returns Direct rows keyed like `ResourceTableRows`.
 */
async function loadTeamDirectRows(teamId: string): Promise<TeamDirectRows> {
  const [memberships, teamSnaps, transitions, mTeam] = await Promise.all([
    optionalRowsByAttribute<TeamMembershipRow>(
      tables.TeamMembership,
      TEAM_ID_ATTR,
      teamId
    ),
    optionalRowsByAttribute<TeamMetricSnapshotRow>(
      tables.TeamMetricSnapshot,
      TEAM_ID_ATTR,
      teamId
    ),
    optionalRowsByAttribute<TransitionEventRow>(
      tables.TransitionEvent,
      "subjectTeamId",
      teamId
    ),
    scanRowsWhere<ArticleTeamMentionRow>(
      tables.ArticleTeamMention,
      row => row.teamId === teamId
    ),
  ]);
  return { memberships, teamSnaps, transitions, mTeam };
}

/**
 * Hydrates the entities referenced by the team's direct rows — member
 * and subject advisors, mentioned articles, the current branch, deals,
 * and firms (widened to canonical alias-merge targets).
 * @param team - Resolved subject team row.
 * @param direct - Rows fetched directly off the team id.
 * @returns Referenced rows keyed like `ResourceTableRows`.
 */
async function loadTeamReferencedRows(
  team: TeamRow,
  direct: TeamDirectRows
): Promise<Partial<ResourceTableRows>> {
  const [advisors, articles, branches, deals, firms, firmAliases] =
    await Promise.all([
      advisorsByIdsBounded(
        distinctIds([
          ...direct.memberships.map(row => row.advisorId),
          ...direct.transitions.map(row => row.subjectAdvisorId),
        ])
      ),
      rowsByIdsOptional<ArticleRow>(
        tables.Article,
        distinctIds(direct.mTeam.map(row => row.articleId))
      ),
      rowsByIdsOptional<BranchRow>(
        tables.Branch,
        distinctIds([team.currentBranchId])
      ),
      rowsByIdsOptional<RecruitingDealQuoteRow>(
        tables.RecruitingDealQuote,
        distinctIds(direct.transitions.map(row => row.recruitingDealId))
      ),
      firmsByIdsWithCanonical([
        team.currentFirmId,
        ...direct.transitions.flatMap(row => [
          row.fromFirmId,
          row.toFirmId,
          row.subjectFirmId,
        ]),
      ]),
      optionalAll<FirmAliasRow>(tables.FirmAlias),
    ]);
  return { advisors, articles, branches, deals, firms, firmAliases };
}
