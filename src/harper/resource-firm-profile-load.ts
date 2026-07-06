/**
 * Per-request scoped loaders for `/FirmProfile/<id>` and
 * `/FirmAdvisors/<id>`. They replace the request-wide `loadAll()`
 * 34-table scan with reads keyed by the subject firm.
 *
 * The Firm table itself IS still read in full — deliberately: it is a
 * small dimension table (hundreds of rows), and three behaviors require
 * the complete set: slug/name route resolution (`resolveFirm` compares
 * slugified names — not expressible as a Harper condition), the curated
 * alias-merge canonicalization (which must see every alias row to fold
 * duplicates), and widening indexed foreign-key queries to rows stored
 * under a stale alias firm id. The `loadAll()` problem this replaces
 * was the 13k-row Advisor / 90k-row EmploymentHistory scans across 34
 * tables, which this module reaches only through indexed lookups.
 */
import type {
  ArticleFirmMentionRow,
  ArticleRow,
  BranchRow,
  BrokerCheckSnapshotRow,
  DisclosureRow,
  EmploymentHistoryRow,
  FirmAliasRow,
  FirmRow,
  RankingEntryRow,
  RankingRow,
  RecruitingDealQuoteRow,
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
import { staleFirmIdReplacements } from "./resource-firm-canonicalization.js";
import { resolveFirm } from "./resource-routing.js";
import {
  advisorsByIdsBounded,
  dedupeRowsById,
  distinctIds,
  rowsByAttributeAcross,
  rowsByIdsOptional,
  scanRowsWhere,
} from "./resource-profile-scoped-load.js";

const FIRM_ID_ATTR = "firmId";

/** Firm rows plus alias rows needed for resolution + canonicalization. */
interface FirmResolutionRows {
  readonly firms: readonly FirmRow[];
  readonly firmAliases: readonly FirmAliasRow[];
}

/**
 * Reads the small Firm and FirmAlias dimension tables in full (see the
 * module header for why the full set is load-bearing here).
 * @returns Firm and firm-alias rows.
 */
async function loadFirmResolutionRows(): Promise<FirmResolutionRows> {
  const [firms, firmAliases] = await Promise.all([
    optionalAll<FirmRow>(tables.Firm),
    optionalAll<FirmAliasRow>(tables.FirmAlias),
  ]);
  return { firms, firmAliases };
}

/**
 * Ids to use in indexed firm foreign-key queries: the canonical firm id
 * plus any stale alias firm ids that canonicalization folds into it —
 * related rows may still be stored under the alias id, and `loadAll()`
 * reached them by rewriting after a full scan.
 * @param firms - Full Firm table rows.
 * @param firmId - Resolved canonical firm id.
 * @returns Distinct firm ids to query related tables with.
 */
function queryFirmIds(
  firms: readonly FirmRow[],
  firmId: string
): readonly string[] {
  const aliasIds = [...staleFirmIdReplacements(firms)]
    .filter(([, canonicalId]) => canonicalId === firmId)
    .map(([staleId]) => staleId);
  return distinctIds([firmId, ...aliasIds]);
}

/**
 * Loads the subject-scoped resource index for one firm profile request.
 * Shape and canonicalization match `loadAll()` exactly, so
 * `firmProfilePayload` and the `resolveFirm` routing (id, curated
 * alias, or slug) behave identically.
 * @param identifier - Route id, slug, or alias for the firm.
 * @returns Scoped `ResourceIndex` (no related rows when the firm does
 *   not resolve, so the caller 404s consistently).
 */
export async function loadFirmProfileIndex(
  identifier: string
): Promise<ResourceIndex> {
  const base = await loadFirmResolutionRows();
  const firm = resolveFirm(buildScopedResourceIndex(base), identifier);
  if (!firm) return buildScopedResourceIndex(base);
  const related = await loadFirmRelatedRows(queryFirmIds(base.firms, firm.id));
  return buildScopedResourceIndex({ ...base, ...related });
}

/**
 * Loads the subject-scoped resource index for one firm roster page
 * (`/FirmAdvisors/<id>` passes the raw route id straight into
 * `firmAdvisorRows`, so no slug resolution happens here — matching the
 * legacy `loadAll()` behavior).
 * @param firmId - Raw firm id from the route.
 * @returns Scoped `ResourceIndex` carrying the firm's employment rows
 *   and the advisors they reference.
 */
export async function loadFirmAdvisorsIndex(
  firmId: string
): Promise<ResourceIndex> {
  const base = await loadFirmResolutionRows();
  const employments = await rowsByAttributeAcross<EmploymentHistoryRow>(
    tables.EmploymentHistory,
    FIRM_ID_ATTR,
    queryFirmIds(base.firms, firmId)
  );
  const advisors = await advisorsByIdsBounded(
    distinctIds(employments.map(row => row.advisorId))
  );
  return buildScopedResourceIndex({ ...base, employments, advisors });
}

/** Rows fetched directly off the subject firm ids. */
interface FirmDirectRows {
  readonly employments: readonly EmploymentHistoryRow[];
  readonly teams: readonly TeamRow[];
  readonly branches: readonly BranchRow[];
  readonly disclosures: readonly DisclosureRow[];
  readonly transitions: readonly TransitionEventRow[];
  readonly bcSnaps: readonly BrokerCheckSnapshotRow[];
  readonly mFirm: readonly ArticleFirmMentionRow[];
  readonly rankings: readonly RankingRow[];
  readonly rankingEntries: readonly RankingEntryRow[];
}

/**
 * Fetches every table the firm profile reads keyed by the firm ids,
 * then hydrates the rows those tables reference.
 * @param firmIds - Canonical firm id plus stale alias ids.
 * @returns Scoped table rows for `buildScopedResourceIndex`.
 */
async function loadFirmRelatedRows(
  firmIds: readonly string[]
): Promise<Partial<ResourceTableRows>> {
  const direct = await loadFirmDirectRows(firmIds);
  const referenced = await loadFirmReferencedRows(direct);
  return { ...direct, ...referenced };
}

/**
 * Fetches the tables that carry a firm id as an indexed foreign key,
 * plus the scan-only `ArticleFirmMention` table and the small curated
 * Ranking/RankingEntry tables. Rankings are read in full because
 * `rankingRows` ties entries to a firm through its entire advisor
 * roster and team set — per-advisor indexed fan-out would be thousands
 * of lookups for a wirehouse, while the curated tables stay tiny.
 * @param firmIds - Canonical firm id plus stale alias ids.
 * @returns Direct rows keyed like `ResourceTableRows`.
 */
async function loadFirmDirectRows(
  firmIds: readonly string[]
): Promise<FirmDirectRows> {
  const wanted = new Set(firmIds);
  const [employments, teams, branches, disclosures, transitions] =
    await Promise.all([
      rowsByAttributeAcross<EmploymentHistoryRow>(
        tables.EmploymentHistory,
        FIRM_ID_ATTR,
        firmIds
      ),
      rowsByAttributeAcross<TeamRow>(tables.Team, "currentFirmId", firmIds),
      rowsByAttributeAcross<BranchRow>(tables.Branch, FIRM_ID_ATTR, firmIds),
      rowsByAttributeAcross<DisclosureRow>(
        tables.Disclosure,
        "firmIdAtTime",
        firmIds
      ),
      loadFirmTransitions(firmIds),
    ]);
  const [bcSnaps, mFirm, rankings, rankingEntries] = await Promise.all([
    rowsByAttributeAcross<BrokerCheckSnapshotRow>(
      tables.BrokerCheckSnapshot,
      "subjectFirmId",
      firmIds
    ),
    scanRowsWhere<ArticleFirmMentionRow>(tables.ArticleFirmMention, row =>
      wanted.has(row.firmId)
    ),
    optionalAll<RankingRow>(tables.Ranking),
    optionalAll<RankingEntryRow>(tables.RankingEntry),
  ]);
  return {
    employments,
    teams,
    branches,
    disclosures,
    transitions,
    bcSnaps,
    mFirm,
    rankings,
    rankingEntries,
  };
}

/**
 * Fetches transitions touching the firm as source, destination, or
 * subject, deduped because one row can match several attributes.
 * @param firmIds - Canonical firm id plus stale alias ids.
 * @returns Distinct transition rows.
 */
async function loadFirmTransitions(
  firmIds: readonly string[]
): Promise<readonly TransitionEventRow[]> {
  const attributes = ["toFirmId", "fromFirmId", "subjectFirmId"] as const;
  const fetched = await Promise.all(
    attributes.map(attribute =>
      rowsByAttributeAcross<TransitionEventRow>(
        tables.TransitionEvent,
        attribute,
        firmIds
      )
    )
  );
  return dedupeRowsById(fetched.flat());
}

/**
 * Hydrates the entities referenced by the firm's direct rows —
 * roster/subject advisors, mentioned articles, subject teams of
 * transitions, deals, and team metric snapshots for team chips.
 * @param direct - Rows fetched directly off the firm ids.
 * @returns Referenced rows keyed like `ResourceTableRows`.
 */
async function loadFirmReferencedRows(
  direct: FirmDirectRows
): Promise<Partial<ResourceTableRows>> {
  const [advisors, articles, subjectTeams, deals, teamSnaps] =
    await Promise.all([
      advisorsByIdsBounded(
        distinctIds([
          ...direct.employments.map(row => row.advisorId),
          ...direct.disclosures.map(row => row.advisorId),
          ...direct.transitions.map(row => row.subjectAdvisorId),
        ])
      ),
      rowsByIdsOptional<ArticleRow>(
        tables.Article,
        distinctIds(direct.mFirm.map(row => row.articleId))
      ),
      rowsByIdsOptional<TeamRow>(
        tables.Team,
        distinctIds(direct.transitions.map(row => row.subjectTeamId)).filter(
          id => !direct.teams.some(team => team.id === id)
        )
      ),
      rowsByIdsOptional<RecruitingDealQuoteRow>(
        tables.RecruitingDealQuote,
        distinctIds(direct.transitions.map(row => row.recruitingDealId))
      ),
      rowsByAttributeAcross<TeamMetricSnapshotRow>(
        tables.TeamMetricSnapshot,
        "teamId",
        direct.teams.map(team => team.id)
      ),
    ]);
  return {
    advisors,
    articles,
    teams: dedupeRowsById([...direct.teams, ...subjectTeams]),
    deals,
    teamSnaps,
  };
}
