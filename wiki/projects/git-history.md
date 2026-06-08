---
type: project
created: 2026-05-23
updated: 2026-06-08
related:
  - ../architecture/project-architecture.md
sources:
  - ../sources/git/2026-05-23-advisory-rankings-git.md
  - ../sources/git/2026-05-25-advisory-rankings-git.md
  - ../sources/git/2026-05-26-advisory-rankings-git.md
  - ../sources/git/2026-05-31-advisory-rankings-git.md
  - ../sources/git/2026-06-01-advisory-rankings-git.md
  - ../sources/git/2026-06-02-advisory-rankings-git.md
  - ../sources/git/2026-06-03-advisory-rankings-git.md
  - ../sources/git/2026-06-06-advisory-rankings-git.md
  - ../sources/git/2026-06-07-advisory-rankings-git.md
  - ../sources/git/2026-06-08-advisory-rankings-git.md
---

# Git history

## Initial ingest window

The first Lisa wiki git ingest ran on 2026-05-23 at HEAD
`af60905303d58ca596c75540e44453612c80c94e`. It captured 135 commits on HEAD and 20 recent merged
PRs from `CodySwannGT/advisory-rankings`; the latest merged PR was #62, "test: keep mobile smoke
focused on drawer." Source: wiki/sources/git/2026-05-23-advisory-rankings-git.md.

## Incremental ingest window

The next git ingest ran on 2026-05-25 at HEAD
`67c58eb2e015b5249a97b351736b674d9f4ef721`. It added 171 commits since the 2026-05-23 cursor,
bringing the branch total to 306 commits, and refreshed recent merged PR metadata through #214,
"chore: update @codyswann/lisa to 2.62.1." Source: wiki/sources/git/2026-05-25-advisory-rankings-git.md.

The 2026-05-26 git ingest ran at HEAD `3638640533b09fb984d9278e6a830a904205a6fb`. It added 57
commits since the 2026-05-25 cursor, bringing the branch total to 363 commits, and refreshed recent
merged PR metadata through #310, "Fix mobile drawer tab order." Source:
wiki/sources/git/2026-05-26-advisory-rankings-git.md.

The 2026-05-31 git ingest ran at HEAD `f10fd534a20d5556952e4b725e892e894bf54c4a`. It added 47
commits since the 2026-05-26 cursor and refreshed recent merged PR metadata through #786,
"fix: match multi-word firm search prefixes." Source:
wiki/sources/git/2026-05-31-advisory-rankings-git.md.

The 2026-06-01 git ingest ran at HEAD `11444ea895b6e8f2df1c660eeca05701436fc8a4`. It added 51
commits since the 2026-05-31 cursor and refreshed recent merged PR metadata through #858,
"Add regulatory discrepancy resource shape." Source:
wiki/sources/git/2026-06-01-advisory-rankings-git.md.

The 2026-06-02 git ingest ran at HEAD `6e85165c46eb9de504201834ef581c427565c832`. It added 48
commits since the 2026-06-01 cursor and refreshed recent merged PR metadata through #889,
"fix: gate deploy freshness on the index.js bundle, not just version.js." Source:
wiki/sources/git/2026-06-02-advisory-rankings-git.md.

The 2026-06-03 git ingest ran at HEAD `af31adb8f7d6037e42901fd8bfa4cbebd55a0a80`. It added 3
commits since the 2026-06-02 cursor and refreshed recent merged PR metadata through #892,
"docs: ingest latest wiki sources." Source:
wiki/sources/git/2026-06-03-advisory-rankings-git.md.

The 2026-06-06 git ingest ran at HEAD `ccf4a529c9561a7843185054e9d7e358bb1ecb76`. It added 30
commits since the 2026-06-03 cursor and refreshed recent merged PR metadata through #913,
"fix: show safe invalid login errors." Source:
wiki/sources/git/2026-06-06-advisory-rankings-git.md.

The 2026-06-07 git ingest ran at HEAD `cd2367be58ce74bfd1b2e348c385542a4b19f6f8`. It added 92
commits since the 2026-06-06 cursor and refreshed recent merged PR metadata through #983,
"fix: make rankings statuses readable on mobile." Source:
wiki/sources/git/2026-06-07-advisory-rankings-git.md.

The 2026-06-08 git ingest ran at HEAD `45d98086993847e8cc7503198c33e24b90d304e4`. It added 78
commits since the 2026-06-07 cursor, bringing the branch total to 1253 commits. GitHub PR metadata
was skipped because the connector's `gh pr list` request timed out. Source:
wiki/sources/git/2026-06-08-advisory-rankings-git.md.

## Recent themes

- Rankings explorer, recruiting-market, and firm due-diligence product surfaces.
- Async-state patterns, auth fallback behavior, and expanded smoke-test evidence.
- Public MCP endpoint, read-only tools/resources, and inspector/setup documentation.
- Firm-source adapter expansion across Merrill, Wells Fargo, RBC, Raymond James, Edward Jones, UBS, and Stifel.
- CI, release, and deploy hardening alongside repeated Lisa upgrades and tracker/workflow automation.
- Mobile drawer accessibility, route recovery/retry actions, recruiting watchlist and overflow
  hardening, advisor evidence panels, feed/search filters, and clean regulatory routes.
- Continued Lisa package upgrades, including the move from the 2.62.x wiki setup to 2.98.1 on
  2026-05-26.
- Watchlist table discovery, AdvisorSearchIndex-backed pagination, watchlist/rating evidence,
  feed-mode reload stabilization, event-backed feed filtering, and multi-word firm search coverage.
- Smoke-test and deployment gate hardening for watchlists, search timeouts, route recovery,
  high-signal filters, sanction pills, and invalid legacy detail routes.
- Advisor comparison expanded from resource tests into route/UI behavior, public entry actions,
  watchlist seeding, selection controls, BrokerCheck attribution, private overlays, and comparison
  smoke evidence.
- Regulatory discrepancy work introduced a dedicated resource shape after the comparison workflow
  landed.
- Regulatory discrepancy work continued into detection, persisted reviews, review immutability tests,
  queue rendering, and reviewed-note display on profile pages.
- Deployment and smoke hardening focused on direct Basic auth, restart tolerance, replication
  freshness polling, and bundle-freshness gates.
- Feed and market-page polish addressed uncategorized feed fallback labels, market page source labels,
  feed Load more pagination, and page-fetch error handling.
- The 2026-06-01 Lisa package update and wiki ingest PR landed during this window.
- The 2026-06-02 wiki ingest PR merged, followed by the 0.1.264 release marker commit.
- The 2026-06-03 wiki ingest PR merged, followed by compare empty-state guidance, stale feed index
  hardening, clean login route and redirect fixes, mobile team/profile detail polish, mobile
  comparison evidence readability, mobile nav core-link exposure, and safer invalid-login error
  handling.
- The 2026-06-06 wiki ingest PR merged, followed by feed boot recovery, deploy boot resilience,
  feed category filter fixes, compliance navigation smoke coverage, data-depth reporting and
  runbook work, advisor and firm profile richness checks, major firm source imports, recruiting
  market economics and thresholds, report packet routing/evidence/source appendix surfaces, article
  detail heading coverage, and mobile rankings status readability.
- The 2026-06-07 wiki ingest PR merged, followed by packet private annotations, report-packet print
  CSS coverage, directory label and compare heading accessibility fixes, watchlist storage/table
  binding hardening, Lisa harness migration to fleet mode, advisor research queue resource work,
  SPA root asset recovery, and deploy-cutover fetch timeout guards.

## Use

Use this page as the wiki's current high-level project-history landing page. For exact commit lists,
consult the source notes. Sources: wiki/sources/git/2026-05-23-advisory-rankings-git.md and
wiki/sources/git/2026-05-25-advisory-rankings-git.md, and
wiki/sources/git/2026-05-26-advisory-rankings-git.md, and
wiki/sources/git/2026-05-31-advisory-rankings-git.md, and
wiki/sources/git/2026-06-01-advisory-rankings-git.md, and
wiki/sources/git/2026-06-02-advisory-rankings-git.md, and
wiki/sources/git/2026-06-03-advisory-rankings-git.md, and
wiki/sources/git/2026-06-06-advisory-rankings-git.md, and
wiki/sources/git/2026-06-07-advisory-rankings-git.md, and
wiki/sources/git/2026-06-08-advisory-rankings-git.md.
