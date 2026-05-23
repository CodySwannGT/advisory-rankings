import { FirmSourceRows } from "./firm-source-adapter.js";

/** Flexible Yext row shape returned by Merrill's advisor search vertical. */
export interface MerrillYextAdvisor {
  readonly [key: string]: unknown;
}

/** Harper rows produced from Merrill locator data, grouped by table. */
export class MerrillRows extends FirmSourceRows {}
