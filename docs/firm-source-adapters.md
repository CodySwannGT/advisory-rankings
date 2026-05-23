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
