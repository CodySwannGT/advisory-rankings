---
type: source
created: 2026-05-25
updated: 2026-05-25
related:
  - ../../requirements/advisorbook-personas.md
sources:
  - ../../../docs/advisor-schema.md
  - ../../../harper-app/README.md
  - ../../../wiki/documentation/root-readme.md
  - ../../../wiki/entities/advisor-domain-model.md
  - ../../../src/web/index.ts
  - ../../../src/web/advisor.ts
  - ../../../src/web/recruiting.ts
  - ../../../src/web/rankings.ts
  - ../../../src/harper/resource-recruiting-market.ts
  - ../../../src/harper/resource-rankings-explorer.ts
  - ../../../src/harper/resource-mcp-tools.ts
  - https://advisory-rankings-de.cody-swann-org.harperfabric.com/Feed
  - https://advisory-rankings-de.cody-swann-org.harperfabric.com/RecruitingMarket?limit=3
  - https://advisory-rankings-de.cody-swann-org.harperfabric.com/RankingsExplorer?limit=3
  - https://advisory-rankings-de.cody-swann-org.harperfabric.com/Search?q=Cairnes
  - https://advisory-rankings-de.cody-swann-org.harperfabric.com/PublicAdvisors?limit=2
sensitivity: internal
source_system: documentation
project: advisory-rankings
---

# AdvisorBook persona seed - 2026-05-25

This source note preserves the persona seed from the user request and the app evidence used to
derive project personas. It is intentionally scoped to user/product personas, not `wiki/staff/`
digital-staff roles.

## User-provided seed personas

The requested starting personas were:

- Recruiter.
- Advisor.
- Individual Investor, meaning someone looking for a financial advisor.
- Journalist, meaning someone looking for adverse or investigative detail on a financial advisor.
- VC firm or angel investor, meaning someone evaluating whether to invest in the app.

## Repository evidence

- AdvisorBook is a Harper/Fabric app for advisor, firm, team, article, ranking, BrokerCheck, and web
  UI data. Source: ../../architecture/project-architecture.md.
- The public web UI exposes a feed, firm profiles, advisor profiles, team profiles, article detail
  pages, recruiting, rankings, compliance/regulatory pages, directories, global search, and a
  read-only MCP endpoint. Source: ../../../harper-app/README.md; source:
  ../../documentation/root-readme.md.
- The home feed renders article cards with transition and disclosure event blocks, trending firms,
  and recent compliance events. Source: ../../../src/web/index.ts.
- Advisor profile pages render identity, current or recent employment, career timeline, teams,
  disclosures, sanctions, transitions, related articles, and right-rail identity/coverage sections.
  Source: ../../../src/web/advisor.ts; source: ../../documentation/root-readme.md.
- The recruiting page consumes `/RecruitingMarket` and renders firm momentum, market activity,
  recent moves, known AUM, missing T12 counts, and source transparency. Source:
  ../../../src/web/recruiting.ts; source: ../../../src/harper/resource-recruiting-market.ts.
- The rankings page consumes `/RankingsExplorer` and renders source-backed ranking rows with profile
  resolution, firm/market context, source URLs, loaded dates, unresolved entities, and unavailable
  score states. Source: ../../../src/web/rankings.ts; source:
  ../../../src/harper/resource-rankings-explorer.ts.
- The read-only MCP layer exposes curated tools for search, feed, advisor profile, firm profile,
  team profile, and article detail. Source: ../../../src/harper/resource-mcp-tools.ts; source:
  ../../../harper-app/README.md.
- The conceptual product layer includes `UserRating`, `UserList`, `UserListEntry`, and
  `AdvisorAggregateRating`, kept separate from source-backed ground truth. Source:
  ../../../docs/advisor-schema.md.

## Deployed app samples

The deployed dev app was sampled on 2026-05-25.

- `/Feed` returned `count: 442` and recent public-web/advisor article cards, including advisor
  profile facts and AdvisorHub article rows.
- `/RecruitingMarket?limit=3` returned one loaded recruiting move: The Taylor Group from Morgan
  Stanley to Wells Fargo Advisors in New York, NY, with known AUM of 5.94B, T12 production of
  18.6M, headcount of 19, and `source-backed` status.
- `/RankingsExplorer?limit=3` returned three ranking rows, two resolved and one unresolved, with
  categories including Next Gen and Over $1B, source-backed status, loaded dates, and missing-score
  states.
- `/Search?q=Cairnes` returned George Cairnes with `sub: suspended`.
- `/PublicAdvisors?limit=2` returned public advisor rows with names, photos, career status, bio text,
  LinkedIn URLs, business email/phone, and `piiLevel: public`.

## Persona derivation notes

- Recruiter is strongly supported by the recruiting market surface, transition events, firm momentum,
  market filters, and deal-economics fields.
- Advisor is supported as a reputation and competitive-context user, but current evidence is stronger
  for viewing public profiles than for self-service profile management.
- Individual Investor is supported by public advisor/firm discovery, regulatory history, BrokerCheck
  context, and ratings/list concepts in the product layer. The current shipped public UI is stronger
  for due diligence than for full consumer advisor selection.
- Journalist is strongly supported by article detail, source URLs, field assertions, disclosure
  events, sanctions, search, and provenance visibility.
- VC firm or angel investor is supported as an evaluator persona rather than a daily operator:
  investor diligence would focus on market coverage, source quality, defensibility, product surfaces,
  read-only MCP distribution, and usage/traction metrics that are not all visible in the app yet.
