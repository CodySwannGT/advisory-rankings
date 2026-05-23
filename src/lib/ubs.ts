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
import { mapUbsAdvisors } from "./ubs-rows.js";
export { buildUbsSearchBody, parseUbsSearchResponse } from "./ubs-api.js";
export { emptyUbsRows, mapUbsAdvisors } from "./ubs-rows.js";
export type { UbsAdvisorEntity, UbsRows } from "./ubs-types.js";
import type { UbsAdvisorEntity } from "./ubs-types.js";

const UBS_LOCATOR_URL = "https://advisors.ubs.com/find-an-advisor/";
const UBS_SEARCH_API_URL =
  "https://presenter.broadridgeadvisor.com/locator/api/Search";

/** Search window passed to UBS's Broadridge Presenter locator API. */
interface UbsSearchOptions {
  readonly input: string;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Builds the public UBS Broadridge Presenter search endpoint URL.
 * @param opts - Search text and page window.
 * @returns UBS API URL. The actual search parameters are sent as JSON POST.
 */
export function buildUbsSearchUrl(opts: UbsSearchOptions): string {
  const url = new URL(UBS_SEARCH_API_URL);
  if (opts.input.trim()) url.searchParams.set("query", opts.input.trim());
  url.searchParams.set("limit", String(opts.limit));
  if (opts.offset > 0) url.searchParams.set("offset", String(opts.offset));
  return url.toString();
}

/** Adapter metadata and pure mapping hooks for the UBS source. */
export const UBS_SOURCE_ADAPTER: FirmSourceAdapter<UbsAdvisorEntity> = {
  firmName: "UBS Wealth Management USA",
  sourceType: "ubs_broadridge_presenter",
  buildSearchUrl: (query, limit, offset) =>
    buildUbsSearchUrl({ input: query, limit, offset }),
  discover: (): FirmSourceDiscovery => ({
    locatorUrl: UBS_LOCATOR_URL,
    feedUrl: UBS_SEARCH_API_URL,
    requestShape:
      'Broadridge Presenter JSON POST with locator="UBS", Company="%<name>", ProfileTypes="Individual", SearchRadius=25, MaxResults, and DoFuzzyNameSearch=0.',
    pagination:
      "Bounded name search returns up to MaxResults individual profiles. ZIP/city branch expansion uses additional app flow and is not walked in this first slice.",
    limitation:
      "Team fields are retained in advisor notes for this slice rather than normalized into Team/TeamMembership rows.",
  }),
  mapRows: mapUbsAdvisors,
};

export const UBS_SEARCH_ENDPOINT_URL = UBS_SEARCH_API_URL;
export const UBS_FINDER_PAGE_URL = UBS_LOCATOR_URL;
