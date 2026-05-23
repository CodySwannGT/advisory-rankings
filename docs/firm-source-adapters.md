# Firm Source Adapter Contract

Firm source adapters import public advisor-locator data from wirehouses and
independent broker-dealers into the AdvisorBook Harper tables. Morgan Stanley
is the reference implementation; every new firm source should follow the
contract in `src/lib/firm-source-adapter.ts`.

## Contract

Adapter mapping code lives under `src/lib/<firm-slug>.ts` and exports pure
functions. Network access and write orchestration stay in
`src/scripts/scrape_<firm_slug>.ts`.

Each adapter must document:

- Public locator URL.
- Feed or endpoint URL, when one exists.
- Request parameters, including search input, pagination, and filters.
- Response fields used for advisor, media, branch, team, designation, and
  provenance rows.
- Limitation when a source is blocked, rate-limited, or lacks a structured
  feed.

Adapters produce rows for the shared table set:

- `Firm`
- `FirmAlias`
- `Branch`
- `Advisor`
- `EmploymentHistory`
- `Designation`
- `Team`
- `TeamMembership`
- `AdvisorResearchCheck`

## CLI Convention

Package scripts use `scrape:<firm-slug>`, backed by
`src/scripts/scrape_<firm_slug>.ts`.

Required flags:

- `--max-advisors <n>` caps the run. Default: 100.
- `--page-size <n>` caps a single source request. Default: 50 or the public
  endpoint's lower maximum.
- `--query <value>` may be repeated for ZIP, city, or keyword searches.
- `--queries <csv>` is accepted for scheduled runs.
- `--json` prints counts and mapped rows for verification.
- `--write` is required for Harper writes. Dry-run is the default.
- `--checked-at <yyyy-mm-dd>` fixes provenance dates in tests and replays.

Bounded proof runs should use:

```bash
bun run scrape:<firm-slug> -- --max-advisors 5 --json
```

## Fixtures

Fixtures live under `tests/fixtures/firm-sources/<firm-slug>/`.

Use these filenames when applicable:

- `discovery.md` for observed locator/feed behavior and limitations.
- `sample-response.json` for a successful feed page.
- `blocked-response.txt` or `blocked-response.json` for source protection,
  rate-limit, or unavailable responses.
- `normalized-output.json` for representative mapped Harper rows.

## Documentation Checklist

When adding a new firm source:

- Update `README.md` quick-start commands and repo-layout entries if a new
  script is added.
- Update this document with source-specific notes when the source introduces a
  new pattern or limitation.
- Update `docs/advisor-schema.md` only when schema fields or provenance
  conventions change.
- Keep `docs/brokercheck-spike.md` unchanged unless BrokerCheck parsing,
  loading, fetching, or crawl orchestration changes.

## Merrill / Bank of America

Merrill's public advisor directory uses a Yext Answers vertical query:

- Locator URL: `https://advisor.ml.com/search`
- Feed URL: `https://liveapi-cached.yext.com/v2/accounts/me/answers/vertical/query`
- Required parameters: `experienceKey=merrill_answers`,
  `verticalKey=financial_professionals`, `version=PRODUCTION`, `locale=en`,
  `v=20240101`, `input`, `limit`, and `offset`.
- Pagination: offset/limit. Blank input returned more than 10,000 rows during
  discovery; ZIP/city input narrows the result set.
- Fixture path: `tests/fixtures/firm-sources/merrill/`.

Bounded dry run:

```bash
bun run scrape:merrill -- --query 10022 --max-advisors 5 --json
```

## Wells Fargo Advisors

Wells Fargo Advisors exposes advisor lists through server-rendered HTML rather
than a public JSON feed:

- Locator URL: `https://www.wellsfargo.com/locator/wellsfargoadvisors/`
- Search URL:
  `https://www.wellsfargo.com/locator/wellsfargoadvisors/search`
- Required parameters for bounded ZIP search: `zip5`, `chkWFA=001`,
  `chkFNet=072`, and `chkBIS=020`.
- Profile pages: location rows may link to
  `https://home.wellsfargoadvisors.com/<branch-code>`. Those branch pages
  include an `Our Financial Advisors` list with advisor profile links.
- Limitation: no structured advisor API was observed. Branches without public
  profile links are skipped because the locator row itself only identifies a
  location, not individual advisors.
- Fixture path: `tests/fixtures/firm-sources/wells-fargo/`.

Bounded dry run:

```bash
bun run scrape:wells-fargo -- --query 10022 --max-advisors 5 --json
```

## RBC Wealth Management

RBC Wealth Management's U.S. advisor finder is a WordPress page with public
AJAX actions:

- Locator URL: `https://www.rbcwealthmanagement.com/en-us/find-an-advisor`
- Feed URL:
  `https://www.rbcwealthmanagement.com/en-us/wp-admin/admin-ajax.php`
- Branch request: `action=rbcwm_get_advisors_branches`, page `nonce`,
  `location_string`, and `data_source=us`.
- Advisor request: `action=rbcwm_get_advisors_by_branch`, page `nonce`,
  `branch_id`, and `data_source=us`.
- Limitation: responses are HTML fragments, not structured JSON records, and
  the nonce must be parsed from the finder page before bounded runs.
- Fixture path: `tests/fixtures/firm-sources/rbc/`.

Bounded dry run:

```bash
bun run scrape:rbc -- --query 10022 --max-advisors 5 --json
```

## Raymond James

Raymond James exposes a public finder shell, but direct search/feed behavior was
not stable from the build runner. Public branch roster pages expose advisor
cards with profile URLs, headshot URLs, email/tel links, role titles, and branch
address fields:

- Locator URL: `https://www.raymondjames.com/find-an-advisor`
- Sample branch roster:
  `https://www.raymondjames.com/manhattan-branch`
- Supported bounded sample: `--query 10022`, which resolves to the Manhattan
  branch roster discovered for New York, NY 10022.
- Direct branch URL input is supported, for example
  `--query https://www.raymondjames.com/manhattan-branch`.
- Limitation: direct `raymondjames.com` requests from this runner timed out or
  failed with HTTP/2 protocol errors, so the scraper tries direct fetch first
  and falls back to public `r.jina.ai` markdown rendering for branch pages.
- Fixture path: `tests/fixtures/firm-sources/raymond-james/`.

Bounded dry run:

```bash
bun run scrape:raymond-james -- --query 10022 --max-advisors 5 --json
```

## Edward Jones

Edward Jones exposes a public Preact search app backed by a JSON results feed:

- Locator URL:
  `https://www.edwardjones.com/us-en/search/financial-advisor/results`
- Feed URL:
  `https://www.edwardjones.com/api/v3/financial-advisor/results`
- Required parameters for bounded ZIP search: `q`, `distance`,
  `distance_unit`, `page`, `matchblock`, and `searchtype`.
- Optional parameter: `pageSize`, used by bounded scraper runs.
- Pagination: `currentPage`, `itemsPerPage`, `resultStartPoint`, and
  `resultCount`.
- Limitation: the locale-prefixed `/us-en/api/v3/...` path returns HTTP 401.
  The root `/api/v3/...` feed works when requested with a browser-like
  referer from the search page.
- Fixture path: `tests/fixtures/firm-sources/edward-jones/`.

Bounded dry run:

```bash
bun run scrape:edward-jones -- --query 10022 --max-advisors 5 --json
```

## UBS

UBS exposes a public React finder backed by Broadridge Presenter JSON APIs.
Source triage in #77 created implementation follow-up #105.

- Locator URL: `https://advisors.ubs.com/find-an-advisor/`
- Feed URL:
  `https://presenter.broadridgeadvisor.com/locator/api/Search`
- Required JSON fields for bounded name search: `locator="UBS"`,
  `Company="%<name>"`, `ProfileTypes="Individual"`, `SearchRadius=25`,
  `MaxResults`, and `DoFuzzyNameSearch=0`.
- Location behavior: the finder searches branch profiles by city/state or
  postal code, then expands nearby branches into advisor/team profiles with
  geo coordinates or a `ParentMarketingName` requirement.
- Response fields observed: `ProfileId`, `UniqueId`, `ProfileType`,
  `Company`, `Addresses`, `Emails`, `LocalNumber`, `MarketingName`,
  `LinkedInUrl`, `ParentMarketingName`, `ParentEntityId`, `ParentSiteUrl`,
  `JobTitle`, `RankTitle`, `TeamSiteNames`, `TeamSiteUrls`, and
  `AdditionalData.EntityId`.
- Limitation: ZIP-style advisor discovery requires reproducing the app's
  branch-expansion sequence; bounded name search is directly usable.

Bounded discovery fetch:

```bash
curl -H 'content-type: application/json' \
  -H 'origin: https://advisors.ubs.com' \
  -H 'referer: https://advisors.ubs.com/find-an-advisor/' \
  --data '{"locator":"UBS","SearchRadius":25,"MaxResults":5,"DoFuzzyNameSearch":0,"Company":"%smith","ProfileTypes":"Individual"}' \
  https://presenter.broadridgeadvisor.com/locator/api/Search
```

## Stifel

Stifel exposes a public server-rendered advisor finder.

- Locator URL: `https://www.stifel.com/fa/search`
- Bounded state sample: `https://www.stifel.com/fa/search?state=ny`
- Bounded name sample: `https://www.stifel.com/fa/search?name=smith`
- Result container: `#searchResults` table rows.
- Advisor link selector: `.search-results-fa-link`, with profile hrefs such
  as `/fa/ward-abbey?`.
- Response fields observed in rows: advisor name, city/state, branch link such
  as `/branch/ny/hauppauge`, profile image, direct phone, toll-free phone, and
  email metadata in `data-fa-name` and `data-fa-url-friendly-name`.
- Pagination behavior: the form carries hidden `PageNumber`, `LastName`,
  `State`, `Zipcode`, and `Distance`; next-page navigation posts
  `PageNumber` and `btnNextPage`.
- Supported first-slice scraper inputs: two-letter state codes, ZIP codes, and
  advisor name fragments. The scraper uses bounded GET result pages and maps
  public rows into `Firm`, `Branch`, `Advisor`, `EmploymentHistory`,
  `Designation`, and `AdvisorResearchCheck`.
- Limitation: no structured JSON feed was observed. The adapter should parse
  HTML and treat empty markup as zero results. POST pagination is documented
  but not walked in the first implementation.
- Fixture path: `tests/fixtures/firm-sources/stifel/`.

Bounded dry run:

```bash
bun run scrape:stifel -- --query ny --max-advisors 5 --json
```

## Ameriprise

Ameriprise serves an advisor finder at `https://www.ameripriseadvisors.com/`.
The direct no-header request returned HTTP 403 from this runner, while the same
page was fetchable with a browser-like user agent. Public markdown rendering
also showed the finder content.

- Locator URL: `https://www.ameripriseadvisors.com/`
- Alternate directory URL:
  `https://www.ameripriseadvisors.com/find-a-financial-advisor-by-state/`
- Visible search modes: location search by ZIP or city/state, and name search.
- Static assets observed:
  `https://www.ameripriseadvisors.com/minified/js/js_1516173233.js?issearch=True&ispreview=False&version=711022102`.
- Support endpoint observed in the static asset:
  `/ods.svc/retrieveFPIDCookie`.
- Limitation: no stable advisor-result API or server-rendered result rows were
  found in static HTML/assets during #77. Treat this as a partial source until
  a browser-network capture identifies the result call, or use BrokerCheck/IAPD
  enrichment for Ameriprise advisors discovered from articles.

## LPL

LPL serves an investor finder at
`https://www.lpl.com/investors/find-an-advisor.html`, but direct curl requests
from this runner were stopped by Cloudflare's JavaScript/cookie challenge.
Public markdown rendering showed the page copy and confirmed the finder UI, but
did not expose advisor result rows or a stable API call.

- Locator URL: `https://www.lpl.com/investors/find-an-advisor.html`
- Visible search behavior: the page supports name and state searches and a map
  result view.
- Blocked response observed: Cloudflare "Just a moment..." page requiring
  JavaScript and cookies.
- Limitation: no direct feed or parseable result markup was available without a
  browser session. Treat this as blocked for simple scheduled scrapers until a
  compliant browser-network path or alternate public source is identified.

## Janney

Janney serves a financial advisor directory at
`https://www.janney.com/wealth-management/how-we-work-with-you/advisor-directory`.
Direct requests from this runner returned Cloudflare block pages. Public
markdown rendering showed the directory form, but no advisor result rows or
stable API call.

- Locator URL:
  `https://www.janney.com/wealth-management/how-we-work-with-you/advisor-directory`
- Visible search modes: search by advisor name, or ZIP code plus mile radius.
- Blocked response observed: Cloudflare "Sorry, you have been blocked" page
  asking for cookies and reporting a Ray ID.
- Limitation: no direct feed or parseable result markup was available without a
  browser session. Treat this as blocked for simple scheduled scrapers until a
  compliant browser-network path or alternate public source is identified.
