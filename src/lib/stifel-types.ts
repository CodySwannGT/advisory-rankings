import { FirmSourceRows } from "./firm-source-adapter.js";

/** Advisor listing parsed from Stifel server-rendered search HTML. */
export interface StifelAdvisorSource {
  readonly advisorName: string;
  readonly advisorUrl?: string;
  readonly branchName?: string;
  readonly branchUrl?: string;
  readonly businessPhone?: string;
  readonly city?: string;
  readonly emailContactName?: string;
  readonly emailUrlFriendlyName?: string;
  readonly headshotUrl?: string;
  readonly linkedInUrl?: string;
  readonly roleTitle?: string;
  readonly searchUrl: string;
  readonly state?: string;
  readonly tollFreePhone?: string;
}

/** Harper row bundle produced by the Stifel adapter. */
export class StifelRows extends FirmSourceRows {}
