// @ts-nocheck
import { dateMs } from "./resource-pagination.js";
import { advisorDisplayName } from "./resource-routing.js";
const ROLE_ORDER = { lead: 0, founding_partner: 1, partner: 2, support_csa: 3 };

/**
 * Splits a team's member rows into sorted current and past groups.
 * @param db - Loaded resource index bundle.
 * @param teamId - Team ID requested by the route.
 * @returns Current and past member arrays ready for the team profile.
 */
export function teamMemberGroups(db, teamId) {
  const rows = db.memberships
    .filter(membership => membership.teamId === teamId)
    .map(membership => ({
      membership,
      advisor: db.byAdvisor.get(membership.advisorId),
    }))
    .filter(({ advisor }) => advisor)
    .map(({ membership, advisor }) => ({
      advisor: {
        id: advisor.id,
        name: advisorDisplayName(advisor),
        careerStatus: advisor.careerStatus,
      },
      role: membership.role,
      startDate: membership.startDate,
      endDate: membership.endDate,
    }));
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
function sortMembers(rows) {
  return [...rows].sort((x, y) => {
    const roleDelta = (ROLE_ORDER[x.role] ?? 99) - (ROLE_ORDER[y.role] ?? 99);
    return roleDelta || dateMs(x.startDate) - dateMs(y.startDate);
  });
}
