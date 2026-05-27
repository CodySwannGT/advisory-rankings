import type {
  FirmSourceAdapter,
  FirmSourceDiscovery,
} from "./firm-source-adapter.js";
export {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
} from "./firm-source-adapter.js";
export type { FirmSourceTable } from "./firm-source-adapter.js";
import { mapMerrillAdvisors } from "./merrill-rows.js";
export { emptyMerrillRows, mapMerrillAdvisors } from "./merrill-rows.js";
export type { MerrillRows, MerrillYextAdvisor } from "./merrill-types.js";
import type { MerrillYextAdvisor } from "./merrill-types.js";

const MERRILL_YEXT_ENDPOINT =
  "https://liveapi-cached.yext.com/v2/accounts/me/answers/vertical/query";
const MERRILL_YEXT_PUBLIC_TOKEN = ["0d9b2553a63dd9c", "1a39224b5b7916fb4"].join(
  ""
);
const MERRILL_EXPERIENCE_KEY = "merrill_answers";
const MERRILL_VERTICAL_KEY = "financial_professionals";

/** Search window passed to Merrill's public Yext advisor search API. */
interface MerrillSearchOptions {
  readonly input?: string;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Builds the public Merrill advisor-locator Yext request URL.
 * @param opts - Search text and page window sent to the locator endpoint.
 * @param opts.input - Search input, usually a ZIP code, city, or blank sample.
 * @param opts.limit - Number of Yext rows requested for this page.
 * @param opts.offset - Offset into the Yext result set.
 * @returns Fully formed URL for the Merrill Yext endpoint.
 */
export function buildMerrillSearchUrl(opts: MerrillSearchOptions): string {
  const url = new URL(MERRILL_YEXT_ENDPOINT);
  for (const [key, value] of Object.entries(searchParams(opts))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Adapter metadata and pure mapping hooks for the Merrill source. */
export const MERRILL_SOURCE_ADAPTER: FirmSourceAdapter<MerrillYextAdvisor> = {
  firmName: "Merrill Lynch Wealth Management",
  sourceType: "merrill_yext",
  buildSearchUrl: (query, limit, offset) =>
    buildMerrillSearchUrl({ input: query, limit, offset }),
  discover: (): FirmSourceDiscovery => ({
    locatorUrl: "https://advisor.ml.com/search",
    feedUrl: MERRILL_YEXT_ENDPOINT,
    requestShape:
      "Yext Answers vertical query with experienceKey=merrill_answers and verticalKey=financial_professionals",
    pagination:
      "Offset/limit window. Blank input returned more than 10,000 advisor rows during discovery; ZIP/city input narrows results.",
  }),
  mapRows: mapMerrillAdvisors,
};

const searchParams = (opts: MerrillSearchOptions): Record<string, string> => ({
  v: "20240101",
  api_key: MERRILL_YEXT_PUBLIC_TOKEN,
  sessionTrackingEnabled: "false",
  experienceKey: MERRILL_EXPERIENCE_KEY,
  input: opts.input ?? "",
  version: "PRODUCTION",
  locale: "en",
  verticalKey: MERRILL_VERTICAL_KEY,
  limit: String(opts.limit),
  offset: String(opts.offset),
});
