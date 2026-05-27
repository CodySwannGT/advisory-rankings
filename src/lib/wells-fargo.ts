import type {
  FirmSourceAdapter,
  FirmSourceDiscovery,
} from "./firm-source-adapter.js";
export {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
} from "./firm-source-adapter.js";
export type { FirmSourceTable } from "./firm-source-adapter.js";
import { mapWellsFargoAdvisors } from "./wells-fargo-rows.js";
export {
  emptyWellsFargoRows,
  mapWellsFargoAdvisors,
} from "./wells-fargo-rows.js";
export {
  parseWellsFargoBranchAdvisors,
  parseWellsFargoLocatorBranches,
} from "./wells-fargo-html.js";
export type {
  WellsFargoAdvisorSource,
  WellsFargoBranchSource,
  WellsFargoRows,
} from "./wells-fargo-types.js";
import type { WellsFargoAdvisorSource } from "./wells-fargo-types.js";

const WELLS_FARGO_LOCATOR_URL =
  "https://www.wellsfargo.com/locator/wellsfargoadvisors/search";

/** Search window passed to the Wells Fargo HTML locator. */
interface WellsFargoSearchOptions {
  readonly input: string;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Builds the public Wells Fargo Advisors locator search URL.
 * @param opts - Search text and page window.
 * @returns Fully formed locator URL.
 */
export function buildWellsFargoSearchUrl(
  opts: WellsFargoSearchOptions
): string {
  const url = new URL(WELLS_FARGO_LOCATOR_URL);
  const input = opts.input.trim();
  if (/^\d{5}$/u.test(input)) {
    url.searchParams.set("zip5", input);
  } else if (input) {
    url.searchParams.set("city", input);
  }
  url.searchParams.set("chkWFA", "001");
  url.searchParams.set("chkFNet", "072");
  url.searchParams.set("chkBIS", "020");
  if (opts.offset > 0) url.searchParams.set("start", String(opts.offset + 1));
  url.searchParams.set("limit", String(opts.limit));
  return url.toString();
}

/** Adapter metadata and pure mapping hooks for the Wells Fargo source. */
export const WELLS_FARGO_SOURCE_ADAPTER: FirmSourceAdapter<WellsFargoAdvisorSource> =
  {
    firmName: "Wells Fargo Advisors",
    sourceType: "wells_fargo_advisors_html",
    buildSearchUrl: (query, limit, offset) =>
      buildWellsFargoSearchUrl({ input: query, limit, offset }),
    discover: (): FirmSourceDiscovery => ({
      locatorUrl: "https://www.wellsfargo.com/locator/wellsfargoadvisors/",
      feedUrl: WELLS_FARGO_LOCATOR_URL,
      requestShape:
        "Server-rendered HTML locator results followed by branch profile HTML pages; no public JSON advisor feed was observed.",
      pagination:
        "Locator displays 25 locations per page. The scraper walks bounded branch-profile links until --max-advisors is reached.",
      limitation:
        "Source exposes advisors through branch profile HTML, not a structured API. Branches without public profile links cannot yield advisor records.",
    }),
    mapRows: mapWellsFargoAdvisors,
  };
