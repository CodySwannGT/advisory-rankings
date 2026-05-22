/** Flexible Yext row shape used by the Morgan Stanley locator mapper. */
export interface MorganStanleyYextLocation {
  readonly [key: string]: unknown;
}

/** Flexible address block embedded in Morgan Stanley Yext rows. */
export interface YextAddress {
  readonly [key: string]: unknown;
}

/** Flexible image block embedded in Morgan Stanley Yext rows. */
export interface YextImage {
  readonly [key: string]: unknown;
}

/** Harper rows produced from Morgan Stanley locator data, grouped by table. */
export class MorganStanleyRows {
  readonly Firm: ReadonlyArray<Record<string, unknown>> = [];
  readonly FirmAlias: ReadonlyArray<Record<string, unknown>> = [];
  readonly Branch: ReadonlyArray<Record<string, unknown>> = [];
  readonly Advisor: ReadonlyArray<Record<string, unknown>> = [];
  readonly EmploymentHistory: ReadonlyArray<Record<string, unknown>> = [];
  readonly Designation: ReadonlyArray<Record<string, unknown>> = [];
  readonly Team: ReadonlyArray<Record<string, unknown>> = [];
  readonly TeamMembership: ReadonlyArray<Record<string, unknown>> = [];
  readonly AdvisorResearchCheck: ReadonlyArray<Record<string, unknown>> = [];
}
