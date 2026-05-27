import { advisorDisplayName } from "./resource-routing.js";
import type {
  DisclosureRow,
  TransitionEventRow,
} from "../types/harper-schema.js";
import type {
  DisclosureEventCard,
  DisclosureRowDb,
  DisclosureRowPayload,
  TransitionEventCard,
  TransitionRow,
  TransitionRowDb,
  TransitionSubject,
} from "./resource-feed-types.js";
import { firmChip } from "./resource-feed-chips.js";

/**
 * Builds a transition row for profile and search resource payloads.
 * @param transition - Transition event row, or a missing lookup result.
 * @param db - Preloaded lookup maps for firms, teams, advisors, and deals.
 * @returns Serializable transition data, or null when the lookup misses.
 */
export function transitionRow(
  transition: TransitionEventRow | null | undefined,
  db: TransitionRowDb
): TransitionRow | null {
  if (!transition) return null;
  const deal = transition.recruitingDealId
    ? (db.byDeal.get(transition.recruitingDealId) ?? null)
    : null;
  return {
    id: transition.id,
    subject: transitionSubject(transition, db),
    fromFirm: firmChip(db.byFirm.get(transition.fromFirmId)),
    toFirm: firmChip(db.byFirm.get(transition.toFirmId)),
    moveDate: transition.moveDate,
    aumMoved: transition.aumMoved,
    productionT12: transition.productionT12,
    headcountMoved: transition.headcountMoved,
    isBreakaway: transition.isBreakaway,
    isReturn: transition.isReturn,
    deal: deal
      ? {
          upfrontPctT12: deal.upfrontPctT12,
          producerTier: deal.producerTier,
          backendMetrics: deal.backendMetrics,
        }
      : null,
  };
}

/**
 * Builds a disclosure row for article and profile payloads.
 * @param disclosure - Disclosure row, or a missing lookup result.
 * @param db - Preloaded lookup maps and related sanction rows.
 * @returns Serializable disclosure data, or null when the lookup misses.
 */
export function disclosureRow(
  disclosure: DisclosureRow | null | undefined,
  db: DisclosureRowDb
): DisclosureRowPayload | null {
  if (!disclosure) return null;
  const sanctions = db.sanctions.filter(
    row => row.disclosureId === disclosure.id
  );
  const advisor = db.byAdvisor.get(disclosure.advisorId);
  return {
    id: disclosure.id,
    advisor: advisor
      ? { id: advisor.id, name: advisorDisplayName(advisor) }
      : undefined,
    disclosureType: disclosure.disclosureType,
    regulator: disclosure.regulator,
    regulatorState: disclosure.regulatorState,
    forum: disclosure.forum,
    status: disclosure.status,
    admitDeny: disclosure.admitDeny,
    dateInitiated: disclosure.dateInitiated,
    dateResolved: disclosure.dateResolved,
    allegationText: disclosure.allegationText,
    allegationCategories: disclosure.allegationCategories,
    ruleViolations: disclosure.ruleViolations,
    awardAmount: disclosure.awardAmount,
    settlementAmount: disclosure.settlementAmount,
    damagesRequested: disclosure.damagesRequested,
    clusterId: disclosure.clusterId,
    sanctions,
  };
}

/**
 * Wraps a transition in the feed event-card envelope.
 * @param transition - Transition row referenced by an article mention.
 * @param db - Preloaded lookup maps needed to render the transition.
 * @returns Feed event card, or null when the transition was removed.
 */
export function transitionSummary(
  transition: TransitionEventRow | null | undefined,
  db: TransitionRowDb
): TransitionEventCard | null {
  if (!transition) return null;
  const row = transitionRow(transition, db);
  if (!row) return null;
  return {
    kind: "transition",
    transitionEventId: transition.id,
    ...row,
  };
}

/**
 * Wraps a disclosure in the feed event-card envelope.
 * @param disclosure - Disclosure row referenced by an article mention.
 * @param db - Preloaded lookup maps needed to render the disclosure.
 * @returns Feed event card, or null when the disclosure was removed.
 */
export function disclosureSummary(
  disclosure: DisclosureRow | null | undefined,
  db: DisclosureRowDb
): DisclosureEventCard | null {
  if (!disclosure) return null;
  const row = disclosureRow(disclosure, db);
  if (!row) return null;
  return {
    kind: "disclosure",
    disclosureId: disclosure.id,
    ...row,
  };
}

/**
 * Resolves the primary subject of a transition across team, advisor, or firm rows.
 * @param transition - Transition row with one of the subject foreign keys set.
 * @param db - Preloaded lookup maps for the possible subject entities.
 * @returns Subject label data, or null when the transition has no subject.
 */
function transitionSubject(
  transition: TransitionEventRow,
  db: TransitionRowDb
): TransitionSubject | null {
  if (transition.subjectTeamId) {
    return {
      kind: "team",
      id: transition.subjectTeamId,
      name: db.byTeam.get(transition.subjectTeamId)?.name,
    };
  }
  if (transition.subjectAdvisorId) {
    return {
      kind: "advisor",
      id: transition.subjectAdvisorId,
      name: advisorDisplayName(db.byAdvisor.get(transition.subjectAdvisorId)),
    };
  }
  if (transition.subjectFirmId) {
    return {
      kind: "firm",
      id: transition.subjectFirmId,
      name: db.byFirm.get(transition.subjectFirmId)?.name,
    };
  }
  return null;
}
