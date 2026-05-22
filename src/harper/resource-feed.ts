// @ts-nocheck
import { cmpDesc } from "./resource-pagination.js";
import { advisorDisplayName, firmShort } from "./resource-routing.js";

/**
 * Builds a compact advisor chip for cards and profile headers.
 * @param advisor - Advisor row to expose, or a missing lookup result.
 * @param db - Preloaded tables and lookup maps used for current firm context.
 * @returns Serializable chip data, or null when the advisor lookup misses.
 */
export function advisorChip(advisor, db) {
  if (!advisor) return null;
  const employment = (db.employments || [])
    .filter(row => row.advisorId === advisor.id && !row.endDate)
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
export function firmChip(firm) {
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
export function teamChip(team, db) {
  if (!team) return null;
  const firm = team.currentFirmId ? db.byFirm.get(team.currentFirmId) : null;
  const latestSnap = (db.teamSnaps || [])
    .filter(snap => snap.teamId === team.id)
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

/**
 * Builds article feed event cards from transition or disclosure mentions.
 * @param article - Article whose event mentions should be expanded.
 * @param db - Preloaded mention tables and entity lookup maps.
 * @returns Transition or disclosure cards in mention order.
 */
export function summarizeArticle(article, db) {
  const transitionIds = db.mTE
    .filter(mention => mention.articleId === article.id)
    .map(mention => mention.transitionEventId);
  if (transitionIds.length)
    return transitionIds
      .map(id => transitionSummary(db.byTransition.get(id), db))
      .filter(Boolean);
  const disclosureIds = db.mDisc
    .filter(mention => mention.articleId === article.id)
    .map(mention => mention.disclosureId);
  if (disclosureIds.length)
    return disclosureIds
      .map(id => disclosureSummary(db.byDisclosure.get(id), db))
      .filter(Boolean);
  return [];
}

/**
 * Derives a short feed preview when an article row has no explicit dek.
 * @param article - Article row that may contain dek or body text.
 * @param eventCards - Expanded event cards used as a fallback summary.
 * @returns Short display text for feed cards.
 */
export function deriveDek(article, eventCards) {
  if (article.dek) return article.dek;
  if (article.bodyText) return `${dekSnippet(article.bodyText)}…`;
  const card = (eventCards || [])[0];
  if (card?.kind === "transition") return transitionDek(card);
  if (card?.kind === "disclosure")
    return `${card.advisor?.name ?? "Advisor"}: ${card.regulator ?? "regulatory"} ${card.disclosureType ?? "matter"}.`;
  return "";
}

/**
 * Builds the full feed-card payload for a single article.
 * @param article - Article row being rendered into the feed.
 * @param db - Preloaded tables and indexes for mentions and event cards.
 * @returns Feed payload consumed by the public web UI.
 */
export function feedItem(article, db) {
  const eventCards = summarizeArticle(article, db);
  return {
    article: articlePayload(article, eventCards),
    eventCards,
    advisors: entityMentions(db.mAdv, article.id, "advisorId")
      .map(id => advisorChip(db.byAdvisor.get(id), db))
      .filter(Boolean),
    firms: entityMentions(db.mFirm, article.id, "firmId")
      .map(id => firmChip(db.byFirm.get(id)))
      .filter(Boolean),
    teams: entityMentions(db.mTeam, article.id, "teamId")
      .map(id => teamChip(db.byTeam.get(id), db))
      .filter(Boolean),
  };
}

/**
 * Builds a transition row for profile and search resource payloads.
 * @param transition - Transition event row, or a missing lookup result.
 * @param db - Preloaded lookup maps for firms, teams, advisors, and deals.
 * @returns Serializable transition data, or null when the lookup misses.
 */
export function transitionRow(transition, db) {
  if (!transition) return null;
  const deal = transition.recruitingDealId
    ? db.byDeal.get(transition.recruitingDealId)
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
    deal: deal && {
      upfrontPctT12: deal.upfrontPctT12,
      producerTier: deal.producerTier,
      backendMetrics: deal.backendMetrics,
    },
  };
}

/**
 * Builds a disclosure row for article and profile payloads.
 * @param disclosure - Disclosure row, or a missing lookup result.
 * @param db - Preloaded lookup maps and related sanction rows.
 * @returns Serializable disclosure data, or null when the lookup misses.
 */
export function disclosureRow(disclosure, db) {
  if (!disclosure) return null;
  const sanctions = db.sanctions.filter(
    row => row.disclosureId === disclosure.id
  );
  const advisor = db.byAdvisor.get(disclosure.advisorId);
  return {
    id: disclosure.id,
    advisor: advisor && { id: advisor.id, name: advisorDisplayName(advisor) },
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
 * Converts an article row to the compact profile coverage shape.
 * @param article - Article row linked from a profile page.
 * @returns Minimal article data for coverage lists.
 */
export function articleStub(article) {
  return {
    id: article.id,
    headline: article.headline,
    publishedDate: article.publishedDate,
    category: article.category,
    url: article.url,
  };
}

/**
 * Wraps a transition in the feed event-card envelope.
 * @param transition - Transition row referenced by an article mention.
 * @param db - Preloaded lookup maps needed to render the transition.
 * @returns Feed event card, or null when the transition was removed.
 */
function transitionSummary(transition, db) {
  return transition
    ? {
        kind: "transition",
        transitionEventId: transition.id,
        ...transitionRow(transition, db),
      }
    : null;
}

/**
 * Wraps a disclosure in the feed event-card envelope.
 * @param disclosure - Disclosure row referenced by an article mention.
 * @param db - Preloaded lookup maps needed to render the disclosure.
 * @returns Feed event card, or null when the disclosure was removed.
 */
function disclosureSummary(disclosure, db) {
  return disclosure
    ? {
        kind: "disclosure",
        disclosureId: disclosure.id,
        ...disclosureRow(disclosure, db),
      }
    : null;
}

/**
 * Resolves the primary subject of a transition across team, advisor, or firm rows.
 * @param transition - Transition row with one of the subject foreign keys set.
 * @param db - Preloaded lookup maps for the possible subject entities.
 * @returns Subject label data, or null when the transition has no subject.
 */
function transitionSubject(transition, db) {
  return (
    (transition.subjectTeamId && {
      kind: "team",
      id: transition.subjectTeamId,
      name: db.byTeam.get(transition.subjectTeamId)?.name,
    }) ||
    (transition.subjectAdvisorId && {
      kind: "advisor",
      id: transition.subjectAdvisorId,
      name: advisorDisplayName(db.byAdvisor.get(transition.subjectAdvisorId)),
    }) ||
    (transition.subjectFirmId && {
      kind: "firm",
      id: transition.subjectFirmId,
      name: db.byFirm.get(transition.subjectFirmId)?.name,
    }) ||
    null
  );
}

/**
 * Shapes article metadata consistently for feed and detail resources.
 * @param article - Source article row.
 * @param eventCards - Event cards used to derive fallback dek text.
 * @returns Serializable article metadata.
 */
function articlePayload(article, eventCards) {
  return {
    id: article.id,
    headline: article.headline,
    dek: deriveDek(article, eventCards),
    url: article.url,
    slug: article.slug,
    publishedDate: article.publishedDate,
    modifiedDate: article.modifiedDate,
    authors: article.authors || [],
    category: article.category,
  };
}

/**
 * Extracts entity IDs from a specific article mention table.
 * @param mentions - Mention rows for one entity kind.
 * @param articleId - Article id whose mentions should be selected.
 * @param field - Foreign-key field containing the mentioned entity id.
 * @returns Entity IDs in stored mention order.
 */
function entityMentions(mentions, articleId, field) {
  return mentions
    .filter(mention => mention.articleId === articleId)
    .map(mention => mention[field]);
}

/**
 * Truncates body text on a word boundary for feed previews.
 * @param text - Article body text that may be longer than the card allows.
 * @returns Display snippet without cutting the last visible word mid-token.
 */
function dekSnippet(text) {
  const snippet = String(text).slice(0, 240);
  const lastSpace = snippet.lastIndexOf(" ");
  return lastSpace > 180 ? snippet.slice(0, lastSpace) : snippet;
}

/**
 * Produces fallback move-summary copy when no article summary exists.
 * @param card - Transition event card already enriched with firms and AUM.
 * @returns Human-readable one-line transition summary.
 */
function transitionDek(card) {
  const aum = card.aumMoved
    ? ` ($${(card.aumMoved / 1e9).toFixed(2)}B AUM)`
    : "";
  return `${transitionSubjectLabel(card.subject)} moves from ${card.fromFirm?.short ?? "?"} to ${card.toFirm?.short ?? "?"}${aum}.`;
}

/**
 * Converts enriched transition subjects into the human-readable dek label.
 * @param subject - Transition subject payload, legacy string, or missing value.
 * @returns Display label for fallback article summary text.
 */
function transitionSubjectLabel(subject) {
  if (!subject) return "Team";
  if (typeof subject === "string") return subject;
  return subject.name || subject.kind || subject.id || "Team";
}
