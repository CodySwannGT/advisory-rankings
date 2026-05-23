import { FirmSourceRows } from "./firm-source-adapter.js";

/** Public Edward Jones locator advisor result. */
export interface EdwardJonesAdvisorSource {
  readonly address?: string;
  readonly certification?: string;
  readonly degreeSuffix?: string;
  readonly distance?: number;
  readonly faCity?: string;
  readonly faContactUrl?: string;
  readonly faCountry?: string;
  readonly faEntityId?: number | string;
  readonly faImage?: string;
  readonly faName: string;
  readonly faState?: string;
  readonly faUrl?: string;
  readonly faZipCode?: string;
  readonly fid?: number | string;
  readonly focusArea?: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly phone?: string;
}

/** Edward Jones locator response shape used by the scraper. */
export interface EdwardJonesSearchResponse {
  readonly currentPage?: number;
  readonly distance_radius?: number;
  readonly distance_unit?: string;
  readonly itemsPerPage?: number;
  readonly resultCount?: number;
  readonly resultStartPoint?: number;
  readonly results?: readonly EdwardJonesAdvisorSource[];
}

/** Harper row bundle produced by the Edward Jones adapter. */
export class EdwardJonesRows extends FirmSourceRows {}
