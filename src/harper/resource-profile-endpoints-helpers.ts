/**
 * Payload builders shared by `src/harper/resource-profile-endpoints.ts`.
 * Extracted from the endpoints module to keep that file under the
 * project-wide 300-line cap. Each helper takes the loaded resource index
 * and produces one slice of the public response.
 */
import type {
  BrokerCheckSnapshotRow,
  FieldAssertionRow,
} from "../types/harper-schema.js";
import type { RouteTarget } from "../types/harper-resource.js";

import type { ResourceIndex } from "./resource-data.js";
import {
  articleStub,
  disclosureRow,
  firmChip,
  teamChip,
  transitionRow,
} from "./resource-feed.js";
import { firmDueDiligenceModules } from "./resource-firm-due-diligence.js";
import type {
  FirmArticleStubView,
  FirmBrokerCheckSnapshotSlice,
  FirmTransitionRowView,
} from "./resource-firm-due-diligence.js";
import { advisorCountsForFirm } from "./resource-firm.js";
import type { FirmAdvisorRow } from "./resource-firm.js";
import { cmpAsc, cmpDesc } from "./resource-pagination.js";
import type { ResolvableFirm, ResolvableTeam } from "./resource-routing.js";
import { teamMemberGroups } from "./resource-team.js";
import type {
  FieldAssertionPayload,
  FirmAdvisorPublicRow,
  FirmProfileBody,
  FirmProfileResponse,
  TeamProfileResponse,
} from "./resource-profile-endpoints-types.js";

/**
 * Minimal `RouteTarget` slice `readStatusParam` reads through. Mirrors
 * the same `.get(name)`-based pattern other endpoints use to pluck a
 * single optional query param without widening the file to the full
 * `RouteTarget` proxy shape.
 */
interface StatusParamTarget {
  readonly get?: (name: string) => unknown;
}

/**
 * Reads the optional `status` query param off a route target without
 * widening the rest of the endpoints module to the `RouteTarget` proxy
 * shape.
 * @param target - Route target carrying optional `status` query param.
 * @returns Raw string value when present, otherwise null.
 */
export function readStatusParam(
  target: RouteTarget | undefined
): string | null {
  if (target == null || typeof target !== "object") return null;
  const getter = (target as StatusParamTarget).get;
  if (typeof getter !== "function") return null;
  const value = getter.call(target, "status");
  return typeof value === "string" ? value : null;
}

/**
 * Keeps article provenance compact while preserving assertion confidence.
 * @param field - Field assertion row linked to an article.
 * @returns Public provenance payload for article detail pages.
 */
export function fieldAssertionPayload(
  field: FieldAssertionRow
): FieldAssertionPayload {
  return {
    targetTable: field.targetTable,
    targetId: field.targetId,
    fieldName: field.fieldName,
    assertedValue: field.assertedValue,
    quotePhrase: field.quotePhrase,
    confidence: field.confidence,
  };
}

/**
 * Builds the firm profile from canonical firm rows and all linked entities.
 * @param db - Preloaded tables and lookup maps.
 * @param firm - Canonical firm row resolved from id, slug, or alias.
 * @returns Firm profile payload used by the public web UI.
 */
export function firmProfilePayload(
  db: ResourceIndex,
  firm: ResolvableFirm
): FirmProfileResponse {
  const firmId = firm.id;
  const { currentAdvisorCount, pastAdvisorCount } = advisorCountsForFirm(
    db,
    firmId
  );
  const profile: FirmProfileBody = {
    firm: { ...firm, short: firm.name },
    currentAdvisorCount,
    pastAdvisorCount,
    currentTeams: db.teams
      .filter(team => team.currentFirmId === firmId)
      .map(team => teamChip(team, db) as unknown),
    transitionsIn: db.transitions
      .filter(row => row.toFirmId === firmId)
      .sort(cmpDesc("moveDate"))
      .map(row => transitionRow(row, db) as unknown as FirmTransitionRowView),
    transitionsOut: db.transitions
      .filter(row => row.fromFirmId === firmId)
      .sort(cmpDesc("moveDate"))
      .map(row => transitionRow(row, db) as unknown as FirmTransitionRowView),
    branches: db.branches.filter(branch => branch.firmId === firmId),
    disclosuresAtThisFirm: db.disclosures
      .filter(row => row.firmIdAtTime === firmId)
      .map(row => disclosureRow(row, db) as unknown),
    articles: mentionedArticles(
      db,
      db.mFirm
        .filter(mention => mention.firmId === firmId)
        .map(mention => mention.articleId)
    ),
    brokerCheckSnapshot: firmBrokerCheckSnapshot(db, firmId),
  };
  return {
    ...profile,
    dueDiligence: firmDueDiligenceModules(db, firmId, profile),
  };
}

/**
 * Builds a team profile with current members, firm context, history, and coverage.
 * @param db - Preloaded tables and lookup maps.
 * @param team - Team row resolved from id or slug.
 * @returns Team profile payload used by the public web UI.
 */
export function teamProfilePayload(
  db: ResourceIndex,
  team: ResolvableTeam
): TeamProfileResponse {
  const teamId = team.id;
  const { currentMembers, pastMembers } = teamMemberGroups(db, teamId);
  const firm = team.currentFirmId ? db.byFirm.get(team.currentFirmId) : null;
  const branch = team.currentBranchId
    ? db.byBranch.get(team.currentBranchId)
    : null;
  return {
    team,
    currentFirm: firm ? (firmChip(firm) as unknown) : null,
    currentBranch: branch
      ? {
          id: branch.id,
          name: branch.name,
          level: branch.level,
          address: branch.address,
          city: branch.city,
          state: branch.state,
          buildingName: branch.buildingName,
        }
      : null,
    currentMembers,
    pastMembers,
    metricSnapshots: db.teamSnaps
      .filter(snap => snap.teamId === teamId)
      .sort(cmpAsc("asOf")),
    transitions: db.transitions
      .filter(row => row.subjectTeamId === teamId)
      .map(row => transitionRow(row, db) as unknown),
    articles: mentionedArticles(
      db,
      db.mTeam
        .filter(mention => mention.teamId === teamId)
        .map(mention => mention.articleId)
    ),
  };
}

/**
 * Resolves article IDs from mention tables into newest-first profile coverage.
 * @param db - Preloaded article lookup map.
 * @param articleIds - Article IDs gathered from one or more mention tables.
 * @returns Compact article rows suitable for profile sidebars.
 */
export function mentionedArticles(
  db: ResourceIndex,
  articleIds: readonly string[]
): readonly FirmArticleStubView[] {
  return [...new Set(articleIds)]
    .map(id => db.byArticle.get(id))
    .filter((article): article is NonNullable<typeof article> =>
      Boolean(article)
    )
    .sort(cmpDesc("publishedDate"))
    .map(article => articleStub(article) as unknown as FirmArticleStubView);
}

/**
 * Exposes the latest firm BrokerCheck snapshot without raw scraper metadata.
 * @param db - Preloaded BrokerCheck snapshot indexes.
 * @param firmId - Canonical firm id used by profile resources.
 * @returns Public snapshot fields, or null when no snapshot exists.
 */
export function firmBrokerCheckSnapshot(
  db: ResourceIndex,
  firmId: string
): FirmBrokerCheckSnapshotSlice | null {
  const snap: BrokerCheckSnapshotRow | undefined = db.bcSnapByFirm.get(firmId);
  if (!snap) return null;
  return {
    fetchedAt: snap.fetchedAt,
    id: snap.id,
    subjectCrd: snap.subjectCrd,
    bcScope: snap.bcScope,
    iaScope: snap.iaScope,
    disclosureCount: snap.disclosureCount,
    registeredStateCount: snap.registeredStateCount,
  };
}

/**
 * Removes internal pagination fields before returning advisor roster rows.
 * @param row - Advisor roster row carrying private sort metadata.
 * @returns Roster row safe to expose through the resource response.
 */
export function stripSortFields(row: FirmAdvisorRow): FirmAdvisorPublicRow {
  const { _sortKey: _sk, _id: _rid, ...publicRow } = row;
  return publicRow;
}
