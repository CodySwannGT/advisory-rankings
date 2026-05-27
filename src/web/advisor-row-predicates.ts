// Typed row predicates for the advisor profile page.
//
// `resourceRows` (in `./detail-state.ts`) returns `readonly unknown[]`
// because a related-resource field may be either an array of rows or an
// error envelope. The advisor profile renderer needs typed row arrays to
// call into `./advisor-sections.ts`, so we bridge `unknown` to the row
// shapes with per-type predicates rather than `as`-casts.

import type {
  AdvisorRegistrationApplicationRow,
  AdvisorTeamRow,
  DesignationStub,
  EducationStub,
  LicenseStub,
} from "../types/advisor-profile.js";
import type { OutsideBusinessActivityRow } from "../types/harper-schema.js";

/** Minimal shape: an object carrying a string `id` field. */
interface HasStringId {
  readonly id: string;
}

/**
 * Narrows an unknown value to a plain object whose `id` field is a string.
 * Most advisor profile rows are keyed by `id`; specialised predicates layer
 * on top of this base check.
 * @param value - Value under inspection.
 * @returns Whether `value` carries a string `id` field.
 */
function hasStringId(value: unknown): value is HasStringId {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  );
}

/**
 * Type predicate for `AdvisorTeamRow`. The row carries a `team` chip plus
 * optional `role`, `startDate`, and `endDate` fields.
 * @param value - Value under inspection.
 * @returns Whether `value` looks like an advisor team membership row.
 */
export function isAdvisorTeamRow(value: unknown): value is AdvisorTeamRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "team" in value &&
    "startDate" in value &&
    "endDate" in value
  );
}

/**
 * Type predicate for `LicenseStub`.
 * @param value - Value under inspection.
 * @returns Whether `value` looks like a license stub.
 */
export function isLicenseStub(value: unknown): value is LicenseStub {
  return (
    hasStringId(value) &&
    "licenseType" in value &&
    typeof value.licenseType === "string"
  );
}

/**
 * Type predicate for `DesignationStub`.
 * @param value - Value under inspection.
 * @returns Whether `value` looks like a designation stub.
 */
export function isDesignationStub(value: unknown): value is DesignationStub {
  return (
    hasStringId(value) && "code" in value && typeof value.code === "string"
  );
}

/**
 * Type predicate for `EducationStub`.
 * @param value - Value under inspection.
 * @returns Whether `value` looks like an education stub.
 */
export function isEducationStub(value: unknown): value is EducationStub {
  return hasStringId(value) && "institution" in value;
}

/**
 * Type predicate for `OutsideBusinessActivityRow`. Requires `id` plus the
 * advisor join key — discriminates from credential stubs that also carry `id`.
 * @param value - Value under inspection.
 * @returns Whether `value` looks like an outside business activity row.
 */
export function isOutsideBusinessActivityRow(
  value: unknown
): value is OutsideBusinessActivityRow {
  return (
    hasStringId(value) &&
    "advisorId" in value &&
    typeof value.advisorId === "string"
  );
}

/**
 * Type predicate for `AdvisorRegistrationApplicationRow`. Requires the firm
 * chip plus the `firmId`/`advisorId` join keys from the base registration
 * application row.
 * @param value - Value under inspection.
 * @returns Whether `value` looks like a registration application row.
 */
export function isRegistrationApplicationRow(
  value: unknown
): value is AdvisorRegistrationApplicationRow {
  return (
    hasStringId(value) &&
    "firm" in value &&
    "firmId" in value &&
    "advisorId" in value
  );
}

/**
 * Narrows a `readonly unknown[]` array (as returned by `resourceRows`) to a
 * typed row array using a per-row predicate. Rows that fail the predicate
 * are dropped — we never `as`-cast across the boundary.
 * @param rows - Unknown row array as returned by `resourceRows`.
 * @param guard - Type predicate used to narrow each row.
 * @returns A `readonly T[]` containing only the rows that satisfy `guard`.
 */
export function narrowRows<T>(
  rows: readonly unknown[],
  guard: (value: unknown) => value is T
): readonly T[] {
  return rows.filter(guard);
}
