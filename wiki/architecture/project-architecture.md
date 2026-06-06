---
type: architecture
created: 2026-05-23
updated: 2026-06-06
related:
  - ../playbooks/local-operations.md
  - ../architecture/harper-fabric-operations.md
sources:
  - ../sources/documentation/2026-05-23-initial-project-docs.md
  - ../sources/git/2026-05-23-advisory-rankings-git.md
  - ../sources/git/2026-06-06-advisory-rankings-git.md
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
