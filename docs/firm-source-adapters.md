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
