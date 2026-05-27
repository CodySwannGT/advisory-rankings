/**
 * Yext locator fetch + pagination for the Morgan Stanley scraper.
 * @module scrape_morgan_stanley_fetcher
 */
import {
  MORGAN_STANLEY_SOURCE_ADAPTER,
  type MorganStanleyYextLocation,
} from "../lib/morgan-stanley.js";
import {
  locationKey,
  type LocationPage,
  type LocationPageState,
  type YextResponse,
} from "./scrape_morgan_stanley_helpers.js";

const MAX_YEXT_OFFSET_LIMIT = 10_000;

/**
 * Fetches a JSON document from the Morgan Stanley Yext feed.
 * @param url - Fully formed Yext request URL.
 * @returns Parsed response payload.
 */
async function fetchJson(url: string): Promise<YextResponse> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "client-sdk": "ANSWERS_CORE=2.5.4, ANSWERS_HEADLESS=2.5.2",
      origin: "https://advisor.morganstanley.com",
      referer: "https://advisor.morganstanley.com/",
      "user-agent": "Mozilla/5.0 advisory-rankings Morgan Stanley scraper",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Morgan Stanley Yext feed returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
    );
  }
  return (await response.json()) as YextResponse;
}

const fetchLocationPage = async (
  state: LocationPageState
): Promise<LocationPage> => {
  const remainingYextWindow = MAX_YEXT_OFFSET_LIMIT - state.offset;
  const limit = Math.min(
    state.pageSize,
    state.maxAdvisors - state.locations.length,
    remainingYextWindow
  );
  const json = await fetchJson(
    MORGAN_STANLEY_SOURCE_ADAPTER.buildSearchUrl(
      state.input,
      limit,
      state.offset
    )
  );
  return {
    total: json.response?.resultsCount ?? 0,
    results: json.response?.results ?? [],
  };
};

const mergeLocationPage = (
  state: LocationPageState,
  page: LocationPage
): LocationPageState => {
  const newLocations = page.results
    .map(result => result.data)
    .filter((location): location is MorganStanleyYextLocation =>
      Boolean(location)
    )
    .filter(
      location =>
        Boolean(locationKey(location)) &&
        !state.seenKeys.includes(locationKey(location))
    )
    .slice(0, state.maxAdvisors - state.locations.length);
  return {
    ...state,
    total: page.total,
    offset: state.offset + page.results.length,
    locations: [...state.locations, ...newLocations],
    seenKeys: [
      ...state.seenKeys,
      ...newLocations.map(locationKey).filter(Boolean),
    ],
  };
};

const collectLocationPages = async (
  state: LocationPageState
): Promise<ReadonlyArray<MorganStanleyYextLocation>> => {
  if (
    state.locations.length >= state.maxAdvisors ||
    state.offset >= state.total ||
    state.offset >= MAX_YEXT_OFFSET_LIMIT
  )
    return state.locations;
  const page = await fetchLocationPage(state);
  if (page.results.length === 0) return state.locations;
  const next = mergeLocationPage(state, page);
  return collectLocationPages(next);
};

/**
 * Fetches unique advisor locations from the Morgan Stanley locator feed.
 * @param input - Locator search input, usually blank or a ZIP/city query.
 * @param maxAdvisors - Maximum advisor rows to fetch.
 * @param pageSize - Number of records requested per page.
 * @returns Deduplicated Yext location rows.
 */
export async function fetchLocations(
  input: string,
  maxAdvisors: number,
  pageSize: number
): Promise<ReadonlyArray<MorganStanleyYextLocation>> {
  return collectLocationPages({
    input,
    maxAdvisors,
    pageSize,
    offset: 0,
    total: Number.POSITIVE_INFINITY,
    locations: [],
    seenKeys: [],
  });
}
