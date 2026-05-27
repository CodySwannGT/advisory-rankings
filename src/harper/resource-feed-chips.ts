import { cmpDesc } from "./resource-pagination.js";
import { advisorDisplayName, firmShort } from "./resource-routing.js";
import type { AdvisorRow, FirmRow, TeamRow } from "../types/harper-schema.js";
import type {
  ResolvableAdvisor,
  ResolvableFirm,
  ResolvableTeam,
} from "./resource-routing.js";
import type {
  AdvisorChip,
  AdvisorChipDb,
  FirmChip,
  TeamChip,
  TeamChipDb,
} from "./resource-feed-types.js";

/**
 * Builds a compact advisor chip for cards and profile headers.
 * @param advisor - Advisor row to expose, or a missing lookup result.
 * @param db - Preloaded tables and lookup maps used for current firm context.
 * @returns Serializable chip data, or null when the advisor lookup misses.
 */
export function advisorChip(
  advisor: AdvisorRow | ResolvableAdvisor | null | undefined,
  db: AdvisorChipDb
): AdvisorChip | null {
  if (!advisor) return null;
  const employment = db.employments
    .filter(row => row.advisorId === advisor.id && !row.endDate)
    .slice()
    .sort(cmpDesc("startDate"))[0];
  const firm = employment ? db.byFirm.get(employment.firmId) : null;
  return {
    id: advisor.id,
    kind: "advisor",
    name: advisorDisplayName(advisor),
    headshotUrl: advisor.headshotUrl || null,
    role: employment?.roleTitle || null,
    firm: firm
      ? { id: firm.id, name: firm.name, short: firmShort(firm.name) }
      : null,
    careerStatus: advisor.careerStatus || null,
  };
}

/**
 * Builds a compact firm chip for cards and profile headers.
 * @param firm - Firm row to expose, or a missing lookup result.
 * @returns Serializable chip data, or null when the firm lookup misses.
 */
export function firmChip(
  firm: FirmRow | ResolvableFirm | null | undefined
): FirmChip | null {
  if (!firm) return null;
  return {
    id: firm.id,
    kind: "firm",
    name: firm.name,
    short: firmShort(firm.name),
    logoUrl: firm.logoUrl || null,
    channel: firm.channel,
    hq: [firm.hqCity, firm.hqState].filter(Boolean).join(", ") || null,
    dissolvedYear: firm.dissolvedYear || null,
  };
}

/**
 * Builds a compact team chip for cards and profile headers.
 * @param team - Team row to expose, or a missing lookup result.
 * @param db - Preloaded tables and lookup maps used for firm and metric context.
 * @returns Serializable chip data, or null when the team lookup misses.
 */
export function teamChip(
  team: TeamRow | ResolvableTeam | null | undefined,
  db: TeamChipDb
): TeamChip | null {
  if (!team) return null;
  const firm = team.currentFirmId ? db.byFirm.get(team.currentFirmId) : null;
  const latestSnap = db.teamSnaps
    .filter(snap => snap.teamId === team.id)
    .slice()
    .sort(cmpDesc("asOf"))[0];
  return {
    id: team.id,
    kind: "team",
    name: team.name,
    firm: firm
      ? { id: firm.id, name: firm.name, short: firmShort(firm.name) }
      : null,
    serviceModel: team.serviceModel || null,
    aum: latestSnap?.aum ?? null,
    teamSize: latestSnap?.teamSize ?? null,
  };
}
