/* eslint-disable functional/type-declaration-immutability -- firm-source row bundles intentionally mirror the shared adapter class shape. */
import type { FirmSourceRows } from "./firm-source-adapter.js";

/** Raymond James branch page parsed from a public roster page. */
export interface RaymondJamesBranchSource {
  readonly name: string;
  readonly branchUrl: string;
  readonly address?: string;
  readonly city?: string;
  readonly state?: string;
  readonly postalCode?: string;
  readonly phone?: string;
}

/** Raymond James advisor row parsed from a public branch roster page. */
export interface RaymondJamesAdvisorSource {
  readonly advisorName: string;
  readonly roleTitle?: string;
  readonly advisorUrl?: string;
  readonly headshotUrl?: string;
  readonly businessEmail?: string;
  readonly businessPhone?: string;
  readonly branch: RaymondJamesBranchSource;
}

/** Harper row bundle emitted by the Raymond James adapter. */
export type RaymondJamesRows = FirmSourceRows;

/* eslint-enable functional/type-declaration-immutability -- re-enable type immutability checks after adapter row alias. */
