import type {
  FirmSourceAdapter,
  FirmSourceDiscovery,
} from "./firm-source-adapter.js";
export {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
} from "./firm-source-adapter.js";
export type { FirmSourceTable } from "./firm-source-adapter.js";
import { mapRaymondJamesAdvisors } from "./raymond-james-rows.js";
export {
  emptyRaymondJamesRows,
  mapRaymondJamesAdvisors,
} from "./raymond-james-rows.js";
export {
  parseRaymondJamesBranch,
  parseRaymondJamesBranchMarkdown,
} from "./raymond-james-markdown.js";
export type {
  RaymondJamesAdvisorSource,
  RaymondJamesRows,
} from "./raymond-james-types.js";
import type { RaymondJamesAdvisorSource } from "./raymond-james-types.js";

const FINDER_URL = "https://www.raymondjames.com/find-an-advisor";
const MANHATTAN_BRANCH_URL = "https://www.raymondjames.com/manhattan-branch";

/** Search window passed to Raymond James public discovery. */
interface RaymondJamesSearchOptions {
  readonly input: string;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Builds the Raymond James finder URL for discovery provenance.
 * @param opts - Search text and page window.
 * @returns Raymond James public finder URL.
 */
export function buildRaymondJamesSearchUrl(
  opts: RaymondJamesSearchOptions
): string {
  const url = new URL(FINDER_URL);
  url.searchParams.set("citystatezip", opts.input);
  url.searchParams.set("lastname", "");
  url.searchParams.set("limit", String(opts.limit));
  url.searchParams.set("offset", String(opts.offset));
  return url.toString();
}

/** Adapter metadata and pure mapping hooks for the Raymond James source. */
export const RAYMOND_JAMES_SOURCE_ADAPTER: FirmSourceAdapter<RaymondJamesAdvisorSource> =
  {
    firmName: "Raymond James",
    sourceType: "raymond_james_branch_roster",
    buildSearchUrl: (query, limit, offset) =>
      buildRaymondJamesSearchUrl({ input: query, limit, offset }),
    discover: (): FirmSourceDiscovery => ({
      locatorUrl: FINDER_URL,
      feedUrl: MANHATTAN_BRANCH_URL,
      requestShape:
        "The public finder shell did not expose a stable JSON feed to this runner; public branch roster pages expose advisor profile, email, phone, headshot, and branch fields.",
      pagination:
        "Bounded runs resolve supported location samples to branch roster pages and cap parsed advisors with --max-advisors.",
      limitation:
        "Direct raymondjames.com requests from this runner hit edge timeouts/HTTP2 protocol failures, so the scraper falls back to r.jina.ai-rendered public markdown for branch pages.",
    }),
    mapRows: mapRaymondJamesAdvisors,
  };

export const RAYMOND_JAMES_MANHATTAN_BRANCH_URL = MANHATTAN_BRANCH_URL;
