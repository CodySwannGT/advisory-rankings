---
name: "firm-advisor-scraper"
description: "Build or extend firm-specific advisor locator scrapers for advisory-rankings. Use when adding a scraper for Morgan Stanley or another financial-advice firm, especially when importing advisor headshotUrl, firm logoUrl, branches, teams, designations, and employment rows with deterministic Harper upserts."
---

# Firm Advisor Scraper

Use this skill when adding a firm locator scraper to the advisory-rankings repo.
The goal is source-backed, resumable imports into Harper, not one-off extraction.

## Workflow

1. Find the public locator's structured data source before using browser
   scraping. Prefer documented or observed JSON feeds over DOM parsing.
2. Add pure mapping code under `src/lib/<firm>.ts`. Keep network and CLI
   orchestration in `src/scripts/scrape_<firm>.ts`.
3. Mint deterministic IDs with `src/lib/ids.ts`.
4. Write all Harper data through `upsert` from `src/lib/harper.ts`.
5. Default CLI behavior must be a dry run. Require `--write` for database
   changes and support caps such as `--max-advisors`.
6. Preserve source media:
   - `Firm.logoUrl`
   - `Advisor.headshotUrl` as the single canonical advisor image
7. Record the current firm relationship with `EmploymentHistory` using a
   firm-specific `sourceType`.
8. Add focused unit tests for the mapper and URL/feed construction.
9. Update `README.md` when adding a script under `src/scripts/`.
10. Update `docs/advisor-schema.md` when schema fields or conventions change.

## Morgan Stanley Pattern

The Morgan Stanley locator uses the Yext vertical query feed:

```text
https://prod-cdn.us.yextapis.com/v2/accounts/me/search/vertical/query
experienceKey=ms-search-locator
verticalKey=locations
```

The current implementation is:

```bash
bun run scrape:morgan-stanley -- --max-advisors 25
bun run scrape:morgan-stanley -- --write --max-advisors 250
```

The mapper imports `Firm`, `Branch`, `Advisor`, `EmploymentHistory`,
`Designation`, `Team`, `TeamMembership`, and `AdvisorResearchCheck`.

Credential reminder: this repo stores Harper credentials in macOS Keychain
services `advisory-rankings-harper-username` and
`advisory-rankings-harper-password`. Do not assume credentials are absent just
because `HDB_ADMIN_USERNAME` / `HDB_ADMIN_PASSWORD` are unset. Use
`src/scripts/_auth.ts` / `loadCreds()` for deployed scraper writes, then write
through Fabric's cluster operation proxy when targeting the Harper Fabric app.

## Verification

Run:

```bash
bun run build
bun run typecheck
bun run test
```

For live-feed proof before enabling an automation, run a capped dry run:

```bash
bun run scrape:<firm> -- --max-advisors 5 --json
```
