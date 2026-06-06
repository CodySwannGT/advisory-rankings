import type {
  AdvisorRow,
  ArticleAdvisorMentionRow,
  ArticleDisclosureMentionRow,
  ArticleFirmMentionRow,
  ArticleTeamMentionRow,
  ArticleTransitionEventMentionRow,
  DisclosureRow,
  EmploymentHistoryRow,
  FirmRow,
  HarperDate,
  RecruitingDealQuoteRow,
  SanctionRow,
  TeamMetricSnapshotRow,
  TeamRow,
  TransitionEventRow,
} from "../types/harper-schema.js";

/** Slice the advisor-chip builder needs to look up the current firm. */
export interface AdvisorChipDb {
  readonly employments: readonly EmploymentHistoryRow[];
  readonly byFirm: ReadonlyMap<string, FirmRow>;
}

/** Slice the team-chip builder needs for firm and latest-snapshot context. */
export interface TeamChipDb {
  readonly teamSnaps: readonly TeamMetricSnapshotRow[];
  readonly byFirm: ReadonlyMap<string, FirmRow>;
}

/** Slice the transition-row builder needs to expand firm, team, deal context. */
export interface TransitionRowDb {
  readonly byFirm: ReadonlyMap<string, FirmRow>;
  readonly byTeam: ReadonlyMap<string, TeamRow>;
  readonly byAdvisor: ReadonlyMap<string, AdvisorRow>;
  readonly byDeal: ReadonlyMap<string, RecruitingDealQuoteRow>;
}

/** Slice the disclosure-row builder needs to look up advisor and sanctions. */
export interface DisclosureRowDb {
  readonly sanctions: readonly SanctionRow[];
  readonly byAdvisor: ReadonlyMap<string, AdvisorRow>;
}

/**
 * Composite slice for `summarizeArticle`: expands transition or disclosure
 * mentions into event cards. Composes the row builders' slices with the
 * mention tables and the lookup maps needed to resolve mention IDs.
 */
export interface SummarizeArticleDb extends TransitionRowDb, DisclosureRowDb {
  readonly mTE: readonly ArticleTransitionEventMentionRow[];
  readonly mDisc: readonly ArticleDisclosureMentionRow[];
  readonly byTransition: ReadonlyMap<string, TransitionEventRow>;
  readonly byDisclosure: ReadonlyMap<string, DisclosureRow>;
}

/**
 * Composite slice for `feedItem`: extends `SummarizeArticleDb` with the
 * advisor/firm/team mention tables and chip-builder dependencies needed
 * to expand the full feed payload for a single article.
 */
export interface FeedDb extends SummarizeArticleDb, AdvisorChipDb, TeamChipDb {
  readonly mAdv: readonly ArticleAdvisorMentionRow[];
  readonly mFirm: readonly ArticleFirmMentionRow[];
  readonly mTeam: readonly ArticleTeamMentionRow[];
}

/** Compact firm reference embedded in chips and transition rows. */
export interface FirmRef {
  readonly id: string;
  readonly name: string;
  readonly short: string;
}

/** Serializable advisor chip payload. */
export interface AdvisorChip {
  readonly id: string;
  readonly kind: "advisor";
  readonly name: string;
  readonly headshotUrl: string | null;
  readonly role: string | null;
  readonly firm: FirmRef | null;
  readonly careerStatus: string | null;
}

/** Serializable firm chip payload. */
export interface FirmChip {
  readonly id: string;
  readonly kind: "firm";
  readonly name: string;
  readonly short: string;
  readonly logoUrl: string | null;
  readonly channel: string;
  readonly hq: string | null;
  readonly dissolvedYear: number | null;
}

/** Serializable team chip payload. */
export interface TeamChip {
  readonly id: string;
  readonly kind: "team";
  readonly name: string;
  readonly firm: FirmRef | null;
  readonly serviceModel: string | null;
  readonly aum: number | null;
  readonly teamSize: number | null;
}

/** Transition subject label payload. */
export interface TransitionSubject {
  readonly kind: "team" | "advisor" | "firm";
  readonly id: string;
  readonly name: string | undefined;
}

/** Deal slice embedded in transition rows. */
export interface TransitionDealSlice {
  readonly upfrontPctT12: number | undefined;
  readonly totalPctT12: number | undefined;
  readonly forgivableLoanTermYears: number | undefined;
  readonly producerTier: string | undefined;
  readonly backendMetrics: string | undefined;
  readonly clawbackTerms: string | undefined;
}

/** Serializable transition row payload. */
export interface TransitionRow {
  readonly id: string;
  readonly subject: TransitionSubject | null;
  readonly fromFirm: FirmChip | null;
  readonly toFirm: FirmChip | null;
  readonly moveDate: HarperDate | undefined;
  readonly aumMoved: number | undefined;
  readonly productionT12: number | undefined;
  readonly headcountMoved: number | undefined;
  readonly isBreakaway: boolean | undefined;
  readonly isReturn: boolean | undefined;
  readonly deal: TransitionDealSlice | null;
}

/** Advisor reference embedded in disclosure rows. */
export interface DisclosureAdvisorRef {
  readonly id: string;
  readonly name: string;
}

/** Serializable disclosure row payload. */
export interface DisclosureRowPayload {
  readonly id: string;
  readonly advisor: DisclosureAdvisorRef | undefined;
  readonly disclosureType: string;
  readonly regulator: string | undefined;
  readonly regulatorState: string | undefined;
  readonly forum: string | undefined;
  readonly status: string | undefined;
  readonly admitDeny: string | undefined;
  readonly dateInitiated: HarperDate | undefined;
  readonly dateResolved: HarperDate | undefined;
  readonly allegationText: string | undefined;
  readonly allegationCategories: readonly string[] | undefined;
  readonly ruleViolations: readonly string[] | undefined;
  readonly awardAmount: number | undefined;
  readonly settlementAmount: number | undefined;
  readonly damagesRequested: number | undefined;
  readonly clusterId: string | undefined;
  readonly sanctions: readonly SanctionRow[];
}

/** Transition event-card envelope. */
export interface TransitionEventCard extends TransitionRow {
  readonly kind: "transition";
  readonly transitionEventId: string;
}

/** Disclosure event-card envelope. */
export interface DisclosureEventCard extends DisclosureRowPayload {
  readonly kind: "disclosure";
  readonly disclosureId: string;
}

/** Either kind of feed event card. */
export type FeedEventCard = TransitionEventCard | DisclosureEventCard;

/** Compact article payload used by feed and detail responses. */
export interface ArticlePayload {
  readonly id: string;
  readonly headline: string | undefined;
  readonly dek: string;
  readonly url: string;
  readonly slug: string | undefined;
  readonly publishedDate: HarperDate | undefined;
  readonly modifiedDate: HarperDate | undefined;
  readonly authors: readonly string[];
  readonly category: string | undefined;
}

/** Minimal article shape used by coverage lists. */
export interface ArticleStub {
  readonly id: string;
  readonly headline: string | undefined;
  readonly publishedDate: HarperDate | undefined;
  readonly category: string | undefined;
  readonly url: string;
}

/** Full feed-card payload for a single article. */
export interface FeedItem {
  readonly article: ArticlePayload;
  readonly eventCards: readonly FeedEventCard[];
  readonly advisors: readonly AdvisorChip[];
  readonly firms: readonly FirmChip[];
  readonly teams: readonly TeamChip[];
}
