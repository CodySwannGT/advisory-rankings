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
import { mapRbcAdvisors } from "./rbc-rows.js";
export { emptyRbcRows, mapRbcAdvisors } from "./rbc-rows.js";
export {
  parseRbcAdvisors,
  parseRbcBranches,
  parseRbcNonce,
} from "./rbc-html.js";
export type {
  RbcAdvisorSource,
  RbcBranchSource,
  RbcRows,
} from "./rbc-types.js";
import type { RbcAdvisorSource } from "./rbc-types.js";

const RBC_FINDER_URL =
  "https://www.rbcwealthmanagement.com/en-us/find-an-advisor";
const RBC_AJAX_URL =
  "https://www.rbcwealthmanagement.com/en-us/wp-admin/admin-ajax.php";

/** Search window passed to RBC's public WordPress AJAX finder. */
interface RbcSearchOptions {
  readonly input: string;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Builds the RBC branch-search endpoint URL.
 * @param opts - Search text and page window.
 * @returns RBC public AJAX URL.
 */
export function buildRbcSearchUrl(opts: RbcSearchOptions): string {
  const url = new URL(RBC_AJAX_URL);
  url.searchParams.set("input", opts.input);
  url.searchParams.set("limit", String(opts.limit));
  url.searchParams.set("offset", String(opts.offset));
  return url.toString();
}

/** Adapter metadata and pure mapping hooks for the RBC source. */
export const RBC_SOURCE_ADAPTER: FirmSourceAdapter<RbcAdvisorSource> = {
  firmName: "RBC Wealth Management",
  sourceType: "rbc_wealth_management_ajax",
  buildSearchUrl: (query, limit, offset) =>
    buildRbcSearchUrl({ input: query, limit, offset }),
  discover: (): FirmSourceDiscovery => ({
    locatorUrl: RBC_FINDER_URL,
    feedUrl: RBC_AJAX_URL,
    requestShape:
      "WordPress admin-ajax POST using action=rbcwm_get_advisors_branches, then action=rbcwm_get_advisors_by_branch for each branch id.",
    pagination:
      "The public branch action returns a bounded nearby branch list for a location string; scraper walks branch ids until --max-advisors is reached.",
    limitation:
      "The feed returns HTML fragments rather than JSON records, and requires a nonce parsed from the finder page.",
  }),
  mapRows: mapRbcAdvisors,
};

export const RBC_FINDER_PAGE_URL = RBC_FINDER_URL;
export const RBC_AJAX_ENDPOINT_URL = RBC_AJAX_URL;
