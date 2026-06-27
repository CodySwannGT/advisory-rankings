---
type: architecture
created: 2026-05-23
updated: 2026-06-27
related:
  - ../playbooks/local-operations.md
  - ../architecture/harper-fabric-operations.md
sources:
  - ../sources/documentation/2026-05-23-initial-project-docs.md
  - ../sources/git/2026-05-23-advisory-rankings-git.md
  - ../sources/git/2026-06-06-advisory-rankings-git.md
  - ../sources/git/2026-06-08-advisory-rankings-git.md
  - ../sources/git/2026-06-10-advisory-rankings-git.md
  - ../sources/git/2026-06-11-advisory-rankings-git.md
  - ../sources/git/2026-06-12-advisory-rankings-git.md
  - ../sources/git/2026-06-13-advisory-rankings-git.md
  - ../sources/git/2026-06-14-advisory-rankings-git.md
  - ../sources/git/2026-06-15-advisory-rankings-git.md
  - ../sources/git/2026-06-16-advisory-rankings-git.md
  - ../sources/git/2026-06-17-advisory-rankings-git.md
  - ../sources/git/2026-06-24-advisory-rankings-git.md
  - ../sources/git/2026-06-25-advisory-rankings-git.md
  - ../sources/git/2026-06-26-advisory-rankings-git.md
  - ../sources/git/2026-06-27-advisory-rankings-git.md
---

# Project architecture

## Overview

`advisory-rankings` is a TypeScript Harper/Fabric application for advisor, firm, team, article,
ranking, BrokerCheck, and AdvisorBook web UI data. The Harper component root is `harper-app/`, while
source TypeScript lives under `src/`. Generated runtime assets are produced by `bun run build` and
emitted into the Harper component tree. Source: wiki/sources/documentation/2026-05-23-initial-project-docs.md.

## Components

- Harper schema and config live in `harper-app/schema.graphql` and `harper-app/config.yaml`.
- Custom resource code is generated from `src/harper/` into `harper-app/resources.js`.
- Browser UI source lives under `src/web/`; generated static assets live under `harper-app/web/`.
- Data workflows live under `src/scripts/`, with build, seed, verify, crawl, ingest, load,
  BrokerCheck, research, deploy, and smoke paths exposed through `package.json`.
- Tests live under `tests/`, including unit-style Vitest coverage and browser smoke scripts.

## Data flow

Source material starts in seeded data, AdvisorHub research artifacts, BrokerCheck fixtures/API
responses, crawler outputs, and manually curated docs. Scripts build the Harper resources, seed or
load records, verify the deployed or local dataset, and expose the AdvisorBook UI through Harper REST
and static routes. Source: wiki/sources/documentation/2026-05-23-initial-project-docs.md.

## Current evolution from git history

The first git-history ingest captured 135 commits at HEAD
`af60905303d58ca596c75540e44453612c80c94e`. Recent work emphasizes release stability, smoke-test
hardening, Fabric deploy consolidation, search/profile performance and reliability, firm alias
canonicalization, BrokerCheck enrichment, and AdvisorBook UI polish. Source:
wiki/sources/git/2026-05-23-advisory-rankings-git.md.

The 2026-06-06 git ingest shows current architecture work focused on login-route correctness, safe
auth-error rendering, mobile navigation and profile detail behavior, comparison evidence readability,
and stale serving-node feed-index tolerance. Source:
wiki/sources/git/2026-06-06-advisory-rankings-git.md.

The 2026-06-08 git ingest shows continued architecture work around user-private table export safety,
watchlist table discovery and runtime binding, root static asset serving, advisor research queue
resources, and bounded fetch attempts so deploy cutovers cannot indefinitely stall the UI. Source:
wiki/sources/git/2026-06-08-advisory-rankings-git.md.

The 2026-06-10 git ingest shows the current deployment architecture favoring direct `:9925`
operations API deploys, with the Studio proxy documented as fallback. It also records hardened
Fabric static-route and cold-start checks, continued rankings UI/resource polish, recruiting-market
verification replay coverage, and deployed smoke selector stabilization. Source:
wiki/sources/git/2026-06-10-advisory-rankings-git.md.

The 2026-06-11 git ingest shows architecture work around Fabric table-shape compatibility in
regulatory discrepancy review, CRD state exposure for the public advisor directory, and research
workbench resource/UI behavior. It also records desktop header-search layout hardening, login
account-access guidance, and continued resource/test coverage threshold work. Source:
wiki/sources/git/2026-06-11-advisory-rankings-git.md.

The 2026-06-12 git ingest shows architecture work around advisor correction workflows: correction
request resources, submission UI, analyst inbox handling, reviewed-note presentation, and isolated
browser smoke sessions. It also records continued evidence UI/provenance cleanup, directory filter
behavior, team-directory deduplication, and rankings page shell/copy alignment. Source:
wiki/sources/git/2026-06-12-advisory-rankings-git.md.

The 2026-06-13 git ingest shows architecture work around deployed route recovery and coverage
inspection: unknown documents now rely on a restored deploy-safe static/web route fallback path,
while the DataCoverage resource and public coverage dashboard provide explicit metric and replay
surfaces. It also records article presentation and recruiting-market source-caveat polish. Source:
wiki/sources/git/2026-06-13-advisory-rankings-git.md.

The 2026-06-14 git ingest shows architecture work around public branch browsing and comparison
selection: PublicBranches resource work, the branch explorer page, clean branch routes, branch
coverage provenance/linking, branch explorer regression coverage, and in-place advisor comparison
selection all landed in the window. It also records feed/source copy cleanup, research queue row
readability fixes, browse rail alignment, and firm profile source-copy clarification. Source:
wiki/sources/git/2026-06-14-advisory-rankings-git.md.

The 2026-06-15 git ingest shows Fabric route handling returning to the post-revert root static
serving arrangement after a brief unknown-document route recovery attempt. The runbook and
Harper-app notes should be read with PR #1242 as the current durable state for root static serving.
Source: wiki/sources/git/2026-06-15-advisory-rankings-git.md.

The 2026-06-17 git ingest shows architecture work around team-continuity timelines: timeline
rendering, evidence-boundary preservation, browser/regression coverage, and evidence expectation
documentation. It also records continued test-threshold maintenance and a Lisa 2.171.3 template
update with a CI unblock fix. Source: wiki/sources/git/2026-06-17-advisory-rankings-git.md.

The 2026-06-24 git ingest shows architecture work around advisor readiness, article evidence,
investor proof packets, and branch-gap/coverage exploration. It records new public readiness and
readiness-finder resources, article evidence limitations/maps, investor proof packet data and route
surfaces, branch gap grouping/filter/lookup fixes, and continued privacy-boundary handling. It also
captures UI polish for mobile advisor search, Team directory filters, comparison controls, recruiting
shortlist briefs, regulatory labels, and global-search dismissal, plus nightly threshold and Lisa
2.176.0 maintenance. Source: wiki/sources/git/2026-06-24-advisory-rankings-git.md.

The 2026-06-25 git ingest shows architecture work consolidating the advisor trust checklist path:
checklist mapping, copy metadata preservation, advisor-profile rendering, browser coverage, and
deployed replay verification landed together. It also records PublicBranches loaded-gap recovery
with a branchId lookup revert, investor proof provenance copy cleanup, and continued test/complexity
threshold maintenance. Source: wiki/sources/git/2026-06-25-advisory-rankings-git.md.

The 2026-06-26 git ingest shows a smaller maintenance window after the trust-checklist rollout:
trust-checklist browser assertions were hardened, max-lines-per-function pressure continued, and the
desktop header search/login layout was repaired to prevent overlap. Source:
wiki/sources/git/2026-06-26-advisory-rankings-git.md.

The 2026-06-27 git ingest shows architecture work around source article triage and recruiting
deal-gap operations: both areas now have resource, route, replay, provenance, and coverage work
recorded in the same window. It also records Fabric deploy hardening for partial deploys and
deployed runtime freshness checks, plus continued coverage and max-lines threshold maintenance.
Source: wiki/sources/git/2026-06-27-advisory-rankings-git.md.
