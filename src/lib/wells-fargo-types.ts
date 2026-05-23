import { FirmSourceRows } from "./firm-source-adapter.js";

/** Branch/location fields parsed from Wells Fargo public locator HTML. */
export interface WellsFargoBranchSource {
  readonly address?: string;
  readonly branchCode?: string;
  readonly branchUrl?: string;
  readonly city?: string;
  readonly fax?: string;
  readonly name: string;
  readonly phone?: string;
  readonly postalCode?: string;
  readonly state?: string;
  readonly subfirm?: string;
  readonly tollFree?: string;
}

/** Advisor listing parsed from a Wells Fargo branch profile page. */
export interface WellsFargoAdvisorSource {
  readonly advisorName: string;
  readonly advisorUrl?: string;
  readonly branch: WellsFargoBranchSource;
}

/** Harper row bundle produced by the Wells Fargo adapter. */
export class WellsFargoRows extends FirmSourceRows {}
