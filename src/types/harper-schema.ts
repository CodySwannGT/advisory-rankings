/**
 * Row interfaces for every Harper @table declared in harper-app/schema.graphql.
 *
 * These are the canonical TS types for rows persisted by the deployed Harper
 * Fabric component. The schema lives in GraphQL SDL (the source of truth for
 * Harper itself); these TS interfaces mirror it 1:1 and exist so application
 * code can drop the per-file TS check suppression without losing type safety
 * on row shapes.
 *
 * Sync rule: when harper-app/schema.graphql changes, update this file in the
 * same commit. The schema doc convention (per CLAUDE.md) treats both as part
 * of the operational contract.
 *
 * Field optionality follows GraphQL nullability:
 *   - `Field!`  → required (`field: T`)
 *   - `Field`   → optional (`field?: T`)
 *
 * The `id` field is declared `ID @primaryKey` in every table; we type it as
 * required `string` because Harper assigns it on write even when GraphQL
 * marks it nullable in SDL.
 *
 * Dates: Harper serializes Date columns to either Date instances (in-process
 * Resource code) or ISO-8601 strings (over REST). Callers normalize as needed
 * — see src/harper/resource-routing.ts for the parsing helpers. Date is
 * structurally mutable, but the project-wide
 * `functional/type-declaration-immutability` relaxation landed in
 * Phase 0 Task #1 (#391) means these interfaces lint clean without any
 * per-file disables.
 */

/** Date value as Harper hands it back: Date in-process, ISO-8601 over REST. */
export type HarperDate = Date | string;

// ─── FIRMS ─────────────────────────────────────────────────────────

/** Firm row. */
export interface FirmRow {
  readonly id: string;
  readonly name: string;
  readonly legalName?: string;
  readonly parentFirmId?: string;
  readonly channel: string;
  readonly subChannel?: string;
  readonly finraCrd?: string;
  readonly secFilerId?: string;
  readonly foundedYear?: number;
  readonly dissolvedYear?: number;
  readonly dissolutionReason?: string;
  readonly hqCity?: string;
  readonly hqState?: string;
  readonly hqCountry?: string;
  readonly isAggregator?: boolean;
  readonly notes?: string;
  readonly website?: string;
  readonly logoUrl?: string;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

/** Firm alias row. */
export interface FirmAliasRow {
  readonly id: string;
  readonly firmId: string;
  readonly alias: string;
  readonly normalizedAlias: string;
  readonly sourceType?: string;
  readonly sourceRef?: string;
  readonly confidence?: string;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

/**
 * Firm merge audit row.
 * @internal Canonical schema row contract reserved for merge-audit reads.
 */
export interface FirmMergeAuditRow {
  readonly id: string;
  readonly oldFirmId: string;
  readonly canonicalFirmId: string;
  readonly oldName?: string;
  readonly canonicalName?: string;
  readonly reason?: string;
  readonly mergedPayload?: string;
  readonly createdAt?: HarperDate;
}

/**
 * Firm succession row.
 * @internal Canonical schema row contract reserved for succession reads.
 */
export interface FirmSuccessionRow {
  readonly id: string;
  readonly predecessorFirmId: string;
  readonly successorFirmId: string;
  readonly successionDate?: HarperDate;
  readonly successionType?: string;
  readonly transferredAssetsPct?: number;
  readonly transferredAdvisorsPct?: number;
  readonly notes?: string;
  readonly createdAt?: HarperDate;
}

// ─── BRANCHES ──────────────────────────────────────────────────────

/** Branch row. */
export interface BranchRow {
  readonly id: string;
  readonly firmId: string;
  readonly parentBranchId?: string;
  readonly level: string;
  readonly name?: string;
  readonly buildingName?: string;
  readonly address?: string;
  readonly city?: string;
  readonly state?: string;
  readonly country?: string;
  readonly postalCode?: string;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

/** Branch assignment row. */
export interface BranchAssignmentRow {
  readonly id: string;
  readonly branchId: string;
  readonly advisorId: string;
  readonly role: string;
  readonly effectiveFrom?: HarperDate;
  readonly effectiveTo?: HarperDate;
  readonly createdAt?: HarperDate;
}

/** Materialized public branch coverage row. */
export interface BranchCoverageRow {
  readonly id: string;
  readonly branchId: string;
  readonly firmId: string;
  readonly currentAdvisorCount: number;
  readonly coverageStatus: "loaded" | "partial" | "unavailable";
  readonly gapGroup:
    | "loaded"
    | "partial"
    | "unavailable"
    | "zero-advisor"
    | "missing-source";
  readonly sourceTypes: readonly string[];
  readonly sourceLabels: readonly string[];
  readonly builtAt?: HarperDate;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

// ─── ADVISORS ──────────────────────────────────────────────────────

/** Advisor row. */
export interface AdvisorRow {
  readonly id: string;
  readonly legalName: string;
  readonly firstName?: string;
  readonly middleInitial?: string;
  readonly middleName?: string;
  readonly lastName?: string;
  readonly suffix?: string;
  readonly preferredName?: string;
  readonly gender?: string;
  readonly birthYear?: number;
  readonly industryStartDate?: HarperDate;
  readonly yearsExperience?: number;
  readonly careerStatus?: string;
  readonly finraCrd?: string;
  readonly secIard?: string;
  readonly headshotUrl?: string;
  readonly bioText?: string;
  readonly linkedinUrl?: string;
  readonly businessEmail?: string;
  readonly businessPhone?: string;
  readonly piiLevel?: string;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

/** Education row. */
export interface EducationRow {
  readonly id: string;
  readonly advisorId: string;
  readonly institution?: string;
  readonly degree?: string;
  readonly field?: string;
  readonly graduationYear?: number;
}

/** Designation row. */
export interface DesignationRow {
  readonly id: string;
  readonly advisorId: string;
  readonly code: string;
  readonly grantingBody?: string;
  readonly earnedDate?: HarperDate;
  readonly expiresDate?: HarperDate;
  readonly status?: string;
}

/** License row. */
export interface LicenseRow {
  readonly id: string;
  readonly advisorId: string;
  readonly licenseType: string;
  readonly state?: string;
  readonly grantedDate?: HarperDate;
  readonly expiresDate?: HarperDate;
  readonly status?: string;
}

// ─── EMPLOYMENT & TEAMS ────────────────────────────────────────────

/** Employment history row. */
export interface EmploymentHistoryRow {
  readonly id: string;
  readonly advisorId: string;
  readonly firmId: string;
  readonly branchId?: string;
  readonly roleTitle?: string;
  readonly roleCategory?: string;
  readonly startDate?: HarperDate;
  readonly endDate?: HarperDate;
  readonly reasonForLeaving?: string;
  readonly aumAtDeparture?: number;
  readonly productionT12AtDeparture?: number;
  readonly signingBonusPromissoryNote?: boolean;
  readonly signingBonusAmount?: number;
  readonly u5Filed?: boolean;
  readonly u5FilingDate?: HarperDate;
  readonly terminationDisclosureId?: string;
  readonly sourceType?: string;
  readonly sourceRef?: string;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

/** Registration application row. */
export interface RegistrationApplicationRow {
  readonly id: string;
  readonly advisorId: string;
  readonly firmId: string;
  readonly appliedDate?: HarperDate;
  readonly status?: string;
  readonly resolvedDate?: HarperDate;
}

/** Team row. */
export interface TeamRow {
  readonly id: string;
  readonly name: string;
  readonly currentFirmId?: string;
  readonly currentBranchId?: string;
  readonly firmProgram?: string;
  readonly foundedYear?: number;
  readonly dissolvedYear?: number;
  readonly serviceModel?: string;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

/** Team membership row. */
export interface TeamMembershipRow {
  readonly id: string;
  readonly teamId: string;
  readonly advisorId: string;
  readonly role?: string;
  readonly startDate?: HarperDate;
  readonly endDate?: HarperDate;
}

/** Team metric snapshot row. */
export interface TeamMetricSnapshotRow {
  readonly id: string;
  readonly teamId: string;
  readonly asOf: HarperDate;
  readonly aum?: number;
  readonly annualRevenue?: number;
  readonly householdCount?: number;
  readonly teamSize?: number;
  readonly sourceType?: string;
  readonly sourceRef?: string;
  readonly createdAt?: HarperDate;
}

/** Advisor metric snapshot row. */
export interface AdvisorMetricSnapshotRow {
  readonly id: string;
  readonly advisorId: string;
  readonly asOf: HarperDate;
  readonly aum?: number;
  readonly productionT12?: number;
  readonly householdCount?: number;
  readonly sourceType?: string;
  readonly sourceRef?: string;
  readonly createdAt?: HarperDate;
}

// ─── EVENTS ────────────────────────────────────────────────────────

/** Transition event row. */
export interface TransitionEventRow {
  readonly id: string;
  readonly subjectAdvisorId?: string;
  readonly subjectTeamId?: string;
  readonly subjectFirmId?: string;
  readonly fromFirmId: string;
  readonly toFirmId: string;
  readonly fromBranchId?: string;
  readonly toBranchId?: string;
  readonly moveDate?: HarperDate;
  readonly announcedDate?: HarperDate;
  readonly aumMoved?: number;
  readonly productionT12?: number;
  readonly headcountMoved?: number;
  readonly recruitingDealId?: string;
  readonly isBreakaway?: boolean;
  readonly isReturn?: boolean;
  readonly notes?: string;
  readonly createdAt?: HarperDate;
}

/** Recruiting deal quote row. */
export interface RecruitingDealQuoteRow {
  readonly id: string;
  readonly firmId: string;
  readonly asOfDate?: HarperDate;
  readonly channelTarget?: string;
  readonly producerTier?: string;
  readonly upfrontPctT12?: number;
  readonly totalPctT12?: number;
  readonly forgivableLoanTermYears?: number;
  readonly backendMetrics?: string;
  readonly clawbackTerms?: string;
  readonly appliesToTransitionEventId?: string;
  readonly sourceArticleId?: string;
}

// ─── COMPLIANCE / DISCLOSURES ──────────────────────────────────────

/** Disclosure row. */
export interface DisclosureRow {
  readonly id: string;
  readonly advisorId: string;
  readonly firmIdAtTime?: string;
  readonly clusterId?: string;
  readonly disclosureType: string;
  readonly regulator?: string;
  readonly regulatorState?: string;
  readonly forum?: string;
  readonly allegationText?: string;
  readonly allegationPeriodStart?: HarperDate;
  readonly allegationPeriodEnd?: HarperDate;
  readonly allegationCategories?: readonly string[];
  readonly productCategories?: readonly string[];
  readonly ruleViolations?: readonly string[];
  readonly status?: string;
  readonly admitDeny?: string;
  readonly wasProSe?: boolean;
  readonly dateInitiated?: HarperDate;
  readonly dateResolved?: HarperDate;
  readonly damagesRequested?: number;
  readonly settlementAmount?: number;
  readonly awardAmount?: number;
  readonly isFirmLevel?: boolean;
  readonly docketNumber?: string;
  readonly sourceType?: string;
  readonly sourceRef?: string;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

/** Regulatory discrepancy row. */
export interface RegulatoryDiscrepancyRow {
  readonly id: string;
  readonly advisorId: string;
  readonly fieldName: string;
  readonly advisorHubSourceType?: string;
  readonly advisorHubSourceRef?: string;
  readonly advisorHubValue?: string;
  readonly brokerCheckSourceType?: string;
  readonly brokerCheckSourceRef?: string;
  readonly brokerCheckValue?: string;
  readonly sourceMetadata?: string;
  readonly severity: string;
  readonly status: string;
  readonly reviewerId?: string;
  readonly reviewerNote?: string;
  readonly reviewedAt?: HarperDate;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

/** Disclosure cluster row. */
export interface DisclosureClusterRow {
  readonly id: string;
  readonly rootEventDescription?: string;
  readonly primaryDisclosureId?: string;
  readonly createdAt?: HarperDate;
}

/** Sanction row. */
export interface SanctionRow {
  readonly id: string;
  readonly disclosureId: string;
  readonly sanctionType: string;
  readonly amount?: number;
  readonly durationMonths?: number;
  readonly jurisdiction?: string;
  readonly effectiveDate?: HarperDate;
  readonly endDate?: HarperDate;
}

/** Outside business activity row. */
export interface OutsideBusinessActivityRow {
  readonly id: string;
  readonly advisorId: string;
  readonly name?: string;
  readonly vehicleType?: string;
  readonly withCustomers?: boolean;
  readonly disclosedToFirm?: boolean;
  readonly startDate?: HarperDate;
  readonly endDate?: HarperDate;
  readonly compensationReceived?: boolean;
  readonly compensationAmountMin?: number;
  readonly compensationAmountMax?: number;
}

// ─── SPECIALIZATION ────────────────────────────────────────────────

/**
 * Employer concentration row.
 * @internal Canonical schema row contract reserved for specialization reads.
 */
export interface EmployerConcentrationRow {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly employerName: string;
  readonly clientRoleType?: string;
  readonly concentrationEstimatePct?: number;
  readonly notes?: string;
}

// ─── RANKINGS ──────────────────────────────────────────────────────

/** Ranking row. */
export interface RankingRow {
  readonly id: string;
  readonly publisher: string;
  readonly name: string;
  readonly year: number;
  readonly subjectType?: string;
  readonly methodologyUrl?: string;
  readonly eligibilityCriteria?: string;
}

/** Ranking entry row. */
export interface RankingEntryRow {
  readonly id: string;
  readonly rankingId: string;
  readonly subjectAdvisorId?: string;
  readonly subjectTeamId?: string;
  readonly subjectFirmId?: string;
  readonly firmId?: string;
  readonly rawDisplayName?: string;
  readonly firmText?: string;
  readonly city?: string;
  readonly state?: string;
  readonly sourceUrl?: string;
  readonly sourceLabel?: string;
  readonly loadedAt?: HarperDate;
  readonly resolutionStatus?: string;
  readonly rank?: number;
  readonly scoreTotal?: number;
  readonly scoreScale?: number;
  readonly scoreGrowth?: number;
  readonly scoreProfessionalism?: number;
  readonly aum?: number;
  readonly productionT12?: number;
  readonly householdCount?: number;
  readonly teamSize?: number;
  readonly growthYoyAumPct?: number;
  readonly growthYoyClientsPct?: number;
  readonly growthYoyProductionPct?: number;
  readonly regulatoryClean?: boolean;
}

// ─── PROVENANCE ────────────────────────────────────────────────────

/** Article row. */
export interface ArticleRow {
  readonly id: string;
  readonly wpId?: number;
  readonly wpPostType?: string;
  readonly url: string;
  readonly slug?: string;
  readonly headline?: string;
  readonly dek?: string;
  readonly publishedDate?: HarperDate;
  readonly modifiedDate?: HarperDate;
  readonly authors?: readonly string[];
  readonly category?: string;
  readonly wpCategories?: readonly number[];
  readonly wpTags?: readonly number[];
  readonly bodyText?: string;
  readonly bodyHtml?: string;
  readonly createdAt?: HarperDate;
}

/** Article advisor mention row. */
export interface ArticleAdvisorMentionRow {
  readonly id: string;
  readonly articleId: string;
  readonly advisorId: string;
}

/** Article firm mention row. */
export interface ArticleFirmMentionRow {
  readonly id: string;
  readonly articleId: string;
  readonly firmId: string;
}

/** Article team mention row. */
export interface ArticleTeamMentionRow {
  readonly id: string;
  readonly articleId: string;
  readonly teamId: string;
}

/** Article transition event mention row. */
export interface ArticleTransitionEventMentionRow {
  readonly id: string;
  readonly articleId: string;
  readonly transitionEventId: string;
}

/** Article disclosure mention row. */
export interface ArticleDisclosureMentionRow {
  readonly id: string;
  readonly articleId: string;
  readonly disclosureId: string;
}

/** Broker check snapshot row. */
export interface BrokerCheckSnapshotRow {
  readonly id: string;
  readonly subjectKind: string;
  readonly subjectCrd: string;
  readonly subjectAdvisorId?: string;
  readonly subjectFirmId?: string;
  readonly fetchedAt: HarperDate;
  readonly bcScope?: string;
  readonly iaScope?: string;
  readonly disclosureCount?: number;
  readonly employmentCount?: number;
  readonly examCount?: number;
  readonly registeredStateCount?: number;
  readonly rawHash?: string;
  readonly rawJson?: string;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

/** Field assertion row. */
export interface FieldAssertionRow {
  readonly id: string;
  readonly articleId: string;
  readonly targetTable: string;
  readonly targetId: string;
  readonly fieldName: string;
  readonly assertedValue?: string;
  readonly quotePhrase?: string;
  readonly confidence?: string;
  readonly assertedAt?: HarperDate;
}

/** Advisor research check row. */
export interface AdvisorResearchCheckRow {
  readonly id: string;
  readonly advisorId: string;
  readonly sourceType: string;
  readonly checkedAt: HarperDate;
  readonly status: string;
  readonly sourcesChecked?: readonly string[];
  readonly notes?: string;
  readonly nextCheckAfter?: HarperDate;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

// ─── USER LAYER ────────────────────────────────────────────────────

/**
 * User row.
 * @internal Canonical schema row contract reserved for user-layer reads.
 */
export interface UserRow {
  readonly id: string;
  readonly email: string;
  readonly displayName?: string;
  readonly createdAt?: HarperDate;
}

/**
 * User rating row.
 * @internal Canonical schema row contract reserved for user-rating reads.
 */
export interface UserRatingRow {
  readonly id: string;
  readonly advisorId: string;
  readonly userId: string;
  readonly ratingInt?: number | null;
  readonly responsiveness?: number | null;
  readonly transparency?: number | null;
  readonly performance?: number | null;
  readonly planningDepth?: number | null;
  readonly reviewText?: string | null;
  readonly createdAt?: HarperDate;
}

/** Advisor correction request row. */
export interface AdvisorCorrectionRequestRow {
  readonly id: string;
  readonly advisorId: string;
  readonly fieldName: string;
  readonly displayedValue?: string;
  readonly proposedValue: string;
  readonly submitterId: string;
  readonly submitterNote?: string;
  readonly sourceType?: string;
  readonly sourceRef?: string;
  readonly sourceContext?: string;
  readonly status: string;
  readonly reviewerId?: string;
  readonly reviewerNote?: string;
  readonly reviewedAt?: HarperDate;
  readonly createdAt?: HarperDate;
  readonly updatedAt?: HarperDate;
}

/** User watchlist row. */
export interface UserWatchlistRow {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly createdAt?: HarperDate;
}

/** User watchlist entry row. */
export interface UserWatchlistEntryRow {
  readonly id: string;
  readonly listId: string;
  readonly advisorId: string;
  readonly rank?: number;
  readonly note?: string;
}
