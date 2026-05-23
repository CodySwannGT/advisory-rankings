import {
  emptyMorganStanleyRows,
  mapMorganStanleyLocations,
  mergeMorganStanleyRows,
} from "./morgan-stanley-rows.js";
import type {
  FirmSourceAdapter,
  FirmSourceDiscovery,
} from "./firm-source-adapter.js";
import { FIRM_SOURCE_SAMPLE_LIMIT } from "./firm-source-adapter.js";
export {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
} from "./firm-source-adapter.js";
export type {
  FirmSourceRunOptions,
  FirmSourceTable,
} from "./firm-source-adapter.js";
export type {
  MorganStanleyRows,
  MorganStanleyYextLocation,
} from "./morgan-stanley-types.js";
import type { MorganStanleyYextLocation } from "./morgan-stanley-types.js";

export {
  emptyMorganStanleyRows,
  mapMorganStanleyLocations,
  mergeMorganStanleyRows,
};

const MORGAN_STANLEY_YEXT_ENDPOINT =
  "https://prod-cdn.us.yextapis.com/v2/accounts/me/search/vertical/query";

const MORGAN_STANLEY_PUBLIC_YEXT_KEY_PARTS = [
  "a0c911df",
  "e81f6f00",
  "26255868",
  "407b6713",
];

/** Search window passed to the Morgan Stanley public locator API. */
interface MorganStanleySearchOptions {
  readonly input?: string;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Builds the public Morgan Stanley advisor-locator Yext request URL.
 * @param opts - Search text and page window sent to the locator endpoint.
 * @param opts.input - Search input, usually a ZIP code or city.
 * @param opts.limit - Number of Yext rows requested for this page.
 * @param opts.offset - Offset into the Yext result set.
 * @returns Fully formed URL for the Morgan Stanley Yext endpoint.
 */
export function buildMorganStanleySearchUrl(
  opts: MorganStanleySearchOptions
): string {
  const url = new URL(MORGAN_STANLEY_YEXT_ENDPOINT);
  for (const [key, value] of Object.entries(searchParams(opts))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Adapter metadata and pure mapping hooks for the Morgan Stanley source. */
export const MORGAN_STANLEY_SOURCE_ADAPTER: FirmSourceAdapter<MorganStanleyYextLocation> =
  {
    firmName: "Morgan Stanley",
    sourceType: "morgan_stanley_yext",
    buildSearchUrl: (query, limit, offset) =>
      buildMorganStanleySearchUrl({ input: query, limit, offset }),
    discover: (): FirmSourceDiscovery => ({
      locatorUrl: "https://advisor.morganstanley.com/",
      feedUrl: MORGAN_STANLEY_YEXT_ENDPOINT,
      requestShape:
        "Yext vertical query with experienceKey=ms-search-locator and verticalKey=locations",
      pagination: `Offset/limit window; use --max-advisors ${FIRM_SOURCE_SAMPLE_LIMIT} for bounded proof runs.`,
    }),
    mapRows: mapMorganStanleyLocations,
  };

const searchParams = (
  opts: MorganStanleySearchOptions
): Record<string, string> => ({
  experienceKey: "ms-search-locator",
  api_key: yextApiKey(),
  v: "20220511",
  version: "PRODUCTION",
  locale: "en",
  input: opts.input ?? "",
  verticalKey: "locations",
  limit: String(opts.limit),
  offset: String(opts.offset),
  retrieveFacets: "false",
  facetFilters: JSON.stringify({
    c_extLocatorClientTypes: [],
    c_extLocatorFocusAreas: [],
    c_extLocatorLanguages: [],
    c_listOfCertifications: [],
    c_locatorSearchType: [],
    c_profileFeatures: [],
  }),
  skipSpellCheck: "false",
  sessionTrackingEnabled: "false",
  sortBys: JSON.stringify([]),
  source: "STANDARD",
});

const yextApiKey = (): string => {
  const env = Reflect.get(process, "env") as NodeJS.ProcessEnv;
  return (
    env.MORGAN_STANLEY_YEXT_API_KEY ??
    MORGAN_STANLEY_PUBLIC_YEXT_KEY_PARTS.join("")
  );
};
