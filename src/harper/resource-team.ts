import type { HarperDate } from "../types/harper-schema.js";
import type { ResourceIndex } from "./resource-data.js";

import { dateMs } from "./resource-pagination.js";
import { advisorDisplayName } from "./resource-routing.js";

const ROLE_ORDER: Readonly<Record<string, number>> = {
  lead: 0,
  founding_partner: 1,
  partner: 2,
  support_csa: 3,
};

/** Advisor chip fields included in team membership payloads. */
export interface TeamMemberAdvisor {
  readonly id: string;
  readonly name: string;
  readonly careerStatus?: string;
}

/** One team membership row rendered by a team profile. */
export interface TeamMemberRow {
  readonly advisor: TeamMemberAdvisor;
  readonly role?: string;
  readonly startDate?: HarperDate;
  readonly endDate?: HarperDate;
}

/** Current and past member groups for a team profile. */
export interface TeamMemberGroups {
  readonly currentMembers: readonly TeamMemberRow[];
  readonly pastMembers: readonly TeamMemberRow[];
}

/**
 * Splits a team's member rows into sorted current and past groups.
 * @param db - Loaded resource index bundle.
 * @param teamId - Team ID requested by the route.
 * @returns Current and past member arrays ready for the team profile.
 */
export function teamMemberGroups(
  db: ResourceIndex,
  teamId: string
): TeamMemberGroups {
  const rows = db.memberships
    .filter(membership => membership.teamId === teamId)
    .flatMap(membership => {
      const advisor = db.byAdvisor.get(membership.advisorId);
      if (!advisor) return [];
      return [
        {
          advisor: {
            id: advisor.id,
            name: advisorDisplayName(advisor),
            careerStatus: advisor.careerStatus,
          },
          role: membership.role,
          startDate: membership.startDate,
          endDate: membership.endDate,
        },
      ];
    });
  return {
    currentMembers: sortMembers(rows.filter(row => !row.endDate)),
    pastMembers: sortMembers(rows.filter(row => row.endDate)),
  };
}

/**
 * Orders team members by role importance and start date.
 * @param rows - Current or past team member rows.
 * @returns Sorted copy of the provided member rows.
 */
function sortMembers(rows: readonly TeamMemberRow[]): readonly TeamMemberRow[] {
  return [...rows].sort((x, y) => {
    const roleDelta = roleRank(x.role) - roleRank(y.role);
    return roleDelta || dateMs(x.startDate) - dateMs(y.startDate);
  });
}

/**
 * Maps a membership role to its display rank.
 * @param role - Membership role from Harper.
 * @returns Sort rank, or the fallback rank for unknown roles.
 */
function roleRank(role: string | undefined): number {
  return role ? (ROLE_ORDER[role] ?? 99) : 99;
}
