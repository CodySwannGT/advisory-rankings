/**
 * Advisor fields needed to choose and describe public-web research targets.
 */
export interface AdvisorResearchAdvisor {
  readonly id: string;
  readonly legalName?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly preferredName?: string;
  readonly finraCrd?: string;
  readonly headshotUrl?: string;
  readonly bioText?: string;
  readonly linkedinUrl?: string;
  readonly businessEmail?: string;
  readonly businessPhone?: string;
}

/**
 * Durable record of a completed source check for an advisor.
 */
export interface AdvisorResearchCheck {
  readonly id: string;
  readonly advisorId: string;
  readonly sourceType: string;
  readonly checkedAt: string;
  readonly status: string;
  readonly sourcesChecked?: ReadonlyArray<string>;
  readonly notes?: string;
  readonly nextCheckAfter?: string;
}

const DAY_MS = 86_400_000;

const WEB_RESEARCH_FIELDS: ReadonlyArray<keyof AdvisorResearchAdvisor> = [
  "headshotUrl",
  "bioText",
  "linkedinUrl",
  "businessEmail",
  "businessPhone",
] as const satisfies ReadonlyArray<keyof AdvisorResearchAdvisor>;

/**
 * Options for selecting stale advisor research targets.
 */
interface SelectDueOptions {
  readonly max: number;
  readonly staleDays: number;
  readonly sourceType: string;
  readonly now?: Date;
}

/**
 * Parse an optional ISO-like date into milliseconds.
 * @param value Date string to parse.
 * @returns Milliseconds since epoch, or null when absent/invalid.
 */
function parseDateMs(value?: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * List public-web fields still missing from an advisor profile.
 * @param advisor Advisor row to inspect.
 * @returns Missing field names.
 */
function missingWebResearchFields(
  advisor: AdvisorResearchAdvisor
): ReadonlyArray<string> {
  return WEB_RESEARCH_FIELDS.filter(field => {
    const value = advisor[field];
    if (Array.isArray(value)) return value.length === 0;
    return !value;
  });
}

/**
 * Find the latest check per advisor for one source type.
 * @param checks Existing check rows.
 * @param sourceType Source lane to consider.
 * @returns Map keyed by advisor id.
 */
function latestCheckByAdvisor(
  checks: readonly AdvisorResearchCheck[],
  sourceType: string
): ReadonlyMap<string, AdvisorResearchCheck> {
  return [...checks]
    .filter(check => check.sourceType === sourceType)
    .sort((left, right) =>
      String(left.checkedAt).localeCompare(String(right.checkedAt))
    )
    .reduce(
      (latest, check) => new Map([...latest, [check.advisorId, check]]),
      new Map<string, AdvisorResearchCheck>()
    );
}

/**
 * Select advisors whose public-web research is missing or stale.
 * @param advisors Advisor rows to consider.
 * @param checks Existing research check rows.
 * @param opts Selection options.
 * @param opts.max Maximum advisors to return.
 * @param opts.staleDays Age threshold for checks.
 * @param opts.sourceType Source lane to evaluate.
 * @param opts.now Optional clock for deterministic tests.
 * @returns Due advisors ordered oldest-check first, then name.
 */
export function selectDueAdvisors(
  advisors: readonly AdvisorResearchAdvisor[],
  checks: readonly AdvisorResearchCheck[],
  opts: SelectDueOptions
) {
  const now = opts.now ?? new Date();
  const cutoffMs = now.getTime() - opts.staleDays * DAY_MS;
  const latest = latestCheckByAdvisor(checks, opts.sourceType);
  const due = advisors
    .map(advisor => dueAdvisorItem(advisor, latest, now))
    .filter(item => {
      const nextCheckMs = parseDateMs(item.lastCheck?.nextCheckAfter);
      if (nextCheckMs !== null && nextCheckMs > now.getTime()) return false;
      const lastMs = parseDateMs(item.lastCheck?.checkedAt);
      return lastMs === null || lastMs <= cutoffMs;
    });

  return [...due]
    .sort((left, right) => {
      const leftMs = parseDateMs(left.lastCheck?.checkedAt) ?? 0;
      const rightMs = parseDateMs(right.lastCheck?.checkedAt) ?? 0;
      return (
        leftMs - rightMs ||
        (left.advisor.legalName ?? "").localeCompare(
          right.advisor.legalName ?? ""
        )
      );
    })
    .slice(0, opts.max);
}

/**
 * Combines advisor and latest-check rows into a due-selection candidate.
 * @param advisor Advisor row under consideration.
 * @param latest Latest checks indexed by advisor id.
 * @param now Clock used for stale-age calculation.
 * @returns Due-selection candidate with missing-field metadata.
 */
function dueAdvisorItem(
  advisor: AdvisorResearchAdvisor,
  latest: ReadonlyMap<string, AdvisorResearchCheck>,
  now: Date
) {
  const lastCheck = latest.get(advisor.id) ?? null;
  const lastMs = parseDateMs(lastCheck?.checkedAt);
  const daysSinceLastCheck =
    lastMs === null ? null : Math.floor((now.getTime() - lastMs) / DAY_MS);
  return {
    advisor,
    lastCheck,
    missingFields: missingWebResearchFields(advisor),
    daysSinceLastCheck,
  };
}
