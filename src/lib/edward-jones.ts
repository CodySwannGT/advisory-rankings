import type {
  FirmSourceAdapter,
  FirmSourceDiscovery,
} from "./firm-source-adapter.js";
export {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
} from "./firm-source-adapter.js";
export type {
  FirmSourceRunOptions,
  FirmSourceTable,
} from "./firm-source-adapter.js";
import { mapEdwardJonesAdvisors } from "./edward-jones-rows.js";
export {
  emptyEdwardJonesRows,
  mapEdwardJonesAdvisors,
} from "./edward-jones-rows.js";
export type {
  EdwardJonesAdvisorSource,
  EdwardJonesRows,
  EdwardJonesSearchResponse,
} from "./edward-jones-types.js";
import type { EdwardJonesAdvisorSource } from "./edward-jones-types.js";

const FINDER_URL =
  "https://www.edwardjones.com/us-en/search/financial-advisor/results";
const RESULTS_API_URL =
  "https://www.edwardjones.com/api/v3/financial-advisor/results";

/** Search window passed to Edward Jones public discovery. */
interface EdwardJonesSearchOptions {
  readonly distance: number;
  readonly input: string;
  readonly page: number;
  readonly pageSize?: number;
  readonly searchType: number;
}

/**
 * Builds the Edward Jones public advisor-results API URL.
 * @param opts - Search text, radius, and page window.
 * @returns Edward Jones public JSON endpoint URL.
 */
export function buildEdwardJonesSearchUrl(
  opts: EdwardJonesSearchOptions
): string {
  const url = new URL(RESULTS_API_URL);
  url.searchParams.set("q", opts.input);
  url.searchParams.set("distance", String(opts.distance));
  url.searchParams.set("distance_unit", "mi");
  url.searchParams.set("page", String(opts.page));
  if (opts.pageSize) {
    url.searchParams.set("pageSize", String(opts.pageSize));
  }
  url.searchParams.set("matchblock", "");
  url.searchParams.set("searchtype", String(opts.searchType));
  return url.toString();
}

/** Adapter metadata and pure mapping hooks for the Edward Jones source. */
export const EDWARD_JONES_SOURCE_ADAPTER: FirmSourceAdapter<EdwardJonesAdvisorSource> =
  {
    firmName: "Edward Jones",
    sourceType: "edward_jones_advisor_results_api",
    buildSearchUrl: (query, limit, offset) =>
      buildEdwardJonesSearchUrl({
        input: query,
        distance: 50,
        page: Math.floor(offset / Math.max(limit, 1)) + 1,
        pageSize: limit,
        searchType: 2,
      }),
    discover: (): FirmSourceDiscovery => ({
      locatorUrl: FINDER_URL,
      feedUrl: RESULTS_API_URL,
      requestShape:
        "The results app requests /api/v3/financial-advisor/results with q, distance, distance_unit, page, optional pageSize, matchblock, and searchtype query parameters. Browser-compatible referer headers are required; the locale-prefixed /us-en/api path returns 401.",
      pagination:
        "The public JSON feed returns currentPage, itemsPerPage, resultStartPoint, and resultCount. Runs advance page by page and cap mapped advisors with --max-advisors.",
    }),
    mapRows: mapEdwardJonesAdvisors,
  };

export const EDWARD_JONES_RESULTS_API_URL = RESULTS_API_URL;
export const EDWARD_JONES_SEARCH_REFERER =
  "https://www.edwardjones.com/us-en/search/find-a-financial-advisor";
