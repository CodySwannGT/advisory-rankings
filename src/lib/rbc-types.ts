import { FirmSourceRows } from "./firm-source-adapter.js";

/** Branch fields parsed from RBC Wealth Management locator HTML. */
export interface RbcBranchSource {
  readonly address?: string;
  readonly branchId: string;
  readonly branchUrl?: string;
  readonly city?: string;
  readonly distance?: string;
  readonly name: string;
  readonly postalCode?: string;
  readonly state?: string;
}

/** Advisor listing parsed from an RBC branch-advisor AJAX response. */
export interface RbcAdvisorSource {
  readonly advisorName: string;
  readonly advisorUrl?: string;
  readonly branch: RbcBranchSource;
  readonly businessEmail?: string;
  readonly businessPhone?: string;
  readonly headshotUrl?: string;
}

/** Harper row bundle produced by the RBC adapter. */
export class RbcRows extends FirmSourceRows {}
