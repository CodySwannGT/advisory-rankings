import { FirmSourceRows } from "./firm-source-adapter.js";

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
export class MorganStanleyRows extends FirmSourceRows {}
