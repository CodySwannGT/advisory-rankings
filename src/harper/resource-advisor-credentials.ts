/**
 * Credential stub builders for advisor profile payloads.
 *
 * Split out from `resource-advisor.ts` so the main module fits under
 * the project-wide `max-lines` threshold without losing per-stub
 * documentation. Each helper trims a Harper row to the small slice
 * surfaced on the public advisor profile.
 */
import { cmpAsc } from "./resource-pagination.js";
import type {
  DesignationRow,
  EducationRow,
  LicenseRow,
} from "../types/harper-schema.js";

/** License stub shape returned by `licenseStub`. */
export interface LicenseStub {
  readonly id: string;
  readonly licenseType: string;
  readonly state: string | undefined;
  readonly grantedDate: LicenseRow["grantedDate"];
  readonly expiresDate: LicenseRow["expiresDate"];
  readonly status: string | undefined;
}

/** Designation stub shape returned by `designationStub`. */
export interface DesignationStub {
  readonly id: string;
  readonly code: string;
  readonly grantingBody: string | undefined;
  readonly earnedDate: DesignationRow["earnedDate"];
  readonly expiresDate: DesignationRow["expiresDate"];
  readonly status: string | undefined;
}

/** Education stub shape returned by `educationStub`. */
export interface EducationStub {
  readonly id: string;
  readonly institution: string | undefined;
  readonly degree: string | undefined;
  readonly field: string | undefined;
  readonly graduationYear: number | undefined;
}

/** Grouped credential sections returned by `advisorCredentials`. */
export interface AdvisorCredentialGroups {
  readonly licenses: readonly LicenseStub[];
  readonly designations: readonly DesignationStub[];
  readonly education: readonly EducationStub[];
}

/** Minimal credential-table slice the advisor profile builder reads. */
export interface CredentialSource {
  readonly licenses?: readonly LicenseRow[];
  readonly designations?: readonly DesignationRow[];
  readonly education?: readonly EducationRow[];
}

/**
 * Builds license, designation, and education sections for an advisor.
 * @param db - Credential-table slice of the resource index.
 * @param advisorId - Advisor ID to match against credential rows.
 * @returns Credential row groups for the advisor profile.
 */
export function advisorCredentials(
  db: CredentialSource,
  advisorId: string
): AdvisorCredentialGroups {
  return {
    licenses: (db.licenses ?? [])
      .filter(row => row.advisorId === advisorId)
      .slice()
      .sort(cmpAsc("grantedDate"))
      .map(licenseStub),
    designations: (db.designations ?? [])
      .filter(row => row.advisorId === advisorId)
      .slice()
      .sort(cmpAsc("earnedDate"))
      .map(designationStub),
    education: (db.education ?? [])
      .filter(row => row.advisorId === advisorId)
      .slice()
      .sort((x, y) => (x.graduationYear ?? 0) - (y.graduationYear ?? 0))
      .map(educationStub),
  };
}

/**
 * Trims a license row to the fields shown on advisor profiles.
 * @param row - License row from Harper.
 * @returns Public license summary.
 */
function licenseStub(row: LicenseRow): LicenseStub {
  return {
    id: row.id,
    licenseType: row.licenseType,
    state: row.state,
    grantedDate: row.grantedDate,
    expiresDate: row.expiresDate,
    status: row.status,
  };
}

/**
 * Trims a designation row to the fields shown on advisor profiles.
 * @param row - Designation row from Harper.
 * @returns Public designation summary.
 */
function designationStub(row: DesignationRow): DesignationStub {
  return {
    id: row.id,
    code: row.code,
    grantingBody: row.grantingBody,
    earnedDate: row.earnedDate,
    expiresDate: row.expiresDate,
    status: row.status,
  };
}

/**
 * Trims an education row to the fields shown on advisor profiles.
 * @param row - Education row from Harper.
 * @returns Public education summary.
 */
function educationStub(row: EducationRow): EducationStub {
  return {
    id: row.id,
    institution: row.institution,
    degree: row.degree,
    field: row.field,
    graduationYear: row.graduationYear,
  };
}
