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
import { mapStifelAdvisors } from "./stifel-rows.js";
export { emptyStifelRows, mapStifelAdvisors } from "./stifel-rows.js";
export { parseStifelSearchResults } from "./stifel-html.js";
export type { StifelAdvisorSource, StifelRows } from "./stifel-types.js";
import type { StifelAdvisorSource } from "./stifel-types.js";

const STIFEL_SEARCH_URL = "https://www.stifel.com/fa/search";

/** Search window passed to Stifel's public HTML finder. */
interface StifelSearchOptions {
  readonly input: string;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Builds the public Stifel advisor search URL for bounded dry runs.
 * @param opts - Search text and page window.
 * @returns Fully formed Stifel search URL.
 */
export function buildStifelSearchUrl(opts: StifelSearchOptions): string {
  const url = new URL(STIFEL_SEARCH_URL);
  const input = opts.input.trim();
  if (/^[a-z]{2}$/iu.test(input)) {
    url.searchParams.set("state", input.toLowerCase());
  } else if (/^\d{5}$/u.test(input)) {
    url.searchParams.set("zipcode", input);
  } else if (input) {
    url.searchParams.set("name", input);
  }
  if (opts.offset > 0) {
    url.searchParams.set(
      "PageNumber",
      String(Math.floor(opts.offset / opts.limit) + 1)
    );
  }
  return url.toString();
}

/** Adapter metadata and pure mapping hooks for the Stifel source. */
export const STIFEL_SOURCE_ADAPTER: FirmSourceAdapter<StifelAdvisorSource> = {
  firmName: "Stifel",
  sourceType: "stifel_search_html",
  buildSearchUrl: (query, limit, offset) =>
    buildStifelSearchUrl({ input: query, limit, offset }),
  discover: (): FirmSourceDiscovery => ({
    locatorUrl: STIFEL_SEARCH_URL,
    feedUrl: STIFEL_SEARCH_URL,
    requestShape:
      "Server-rendered HTML search rows under #searchResults. GET supports bounded state, name, and ZIP query parameters.",
    pagination:
      "The search page renders a POST pager with hidden PageNumber, LastName, State, Zipcode, and Distance fields. The first implementation fetches the first bounded GET page and documents POST pagination as a follow-up limitation.",
    limitation:
      "No structured JSON feed was observed. Search result rows expose contact metadata but not direct email addresses.",
  }),
  mapRows: mapStifelAdvisors,
};
