---
type: source
created: 2026-05-23
updated: 2026-05-23
related: []
sources:
  - ../../../package.json
  - ../../documentation/root-readme.md
  - ../../../docs/advisor-schema.md
  - ../../../docs/data-model-decisions.md
  - ../../../docs/deploy-to-harper-fabric.md
  - ../../../docs/fabric-runbook.md
  - ../../../docs/design-system.md
  - ../../../docs/brokercheck-spike.md
  - ../../../harper-app/README.md
  - ../../../harper-app/config.yaml
  - ../../../harper-app/schema.graphql
  - ../../../research/README.md
source_system: documentation
project: advisory-rankings
---

# initial project documentation ingest - 2026-05-23

This source note captures the existing project documentation and core operational manifests at the
first Lisa wiki ingest. It is a map of the durable operational material already present in the repo
rather than a replacement for the source documents.

## Project identity and layout

- The repo is `CodySwannGT/advisory-rankings`.
- It is a Harper/Fabric app whose Harper component root is `harper-app/`.
- TypeScript source lives under `src/`.
- Generated deploy JavaScript is emitted into `harper-app/resources.js` and
  `harper-app/web/**/*.js` by `bun run build`.
- The root README previously carried quick start, deploy, web UI, repo layout, seeded-data, and data
  source notes. That content was preserved at `wiki/documentation/root-readme.md` before README stub
  mode was applied.

## Operational commands

The preserved root README and `package.json` describe the standard local path:

- install with Bun,
- run `bun run build`,
- seed and verify with `bun run seed` / `bun run verify`,
- use REST variants for Fabric paths,
- run smoke tests with `bun run smoke` and `BASE_URL=... bun run smoke`.

## Advisor data model

`docs/advisor-schema.md` defines the conceptual advisor data model. It includes advisors, education,
designations, licenses, firms, firm aliases, firm merge audit records, branches, employment history,
teams, team memberships, metric snapshots, transition events, disclosures, sanctions, outside
business activities, practice focus, rankings, ranking entries, articles, BrokerCheck snapshots,
advisor research checks, awards, and user product objects.

`docs/data-model-decisions.md` records the major relational design choices and trade-offs, including
polymorphic subjects, branch hierarchy, firm self-references, advisor roles per branch, disclosure
clusters, metric snapshots, and provenance.

## Harper Fabric operations

`docs/deploy-to-harper-fabric.md`, `docs/fabric-runbook.md`, and `harper-app/README.md` describe how
the deployed dev app is structured and operated. The runbook is the practical deploy log for
`advisory-rankings-dev`, including topology, credentials handling, the `:9925` firewall caveat, REST
seed/verify workarounds, static web UI deployment, local smoke testing, and credential rotation.

## Web UI and design system

`docs/design-system.md` defines the AdvisorBook Atomic Design system. Source components live under
`src/web/design-system/` and are emitted to `harper-app/web/design-system/`. Pages should import from
`src/web/design-system/index.ts`.

## BrokerCheck and research assets

`docs/brokercheck-spike.md` records BrokerCheck feasibility, endpoint shapes, schema fit, terms of
use constraints, operating modes, wave orchestration, deduplication, idempotency, resumability, and
known follow-ups. `research/README.md` describes how to regenerate the research corpus from a
non-blocked IP and where sample articles, BrokerCheck fixtures, and extraction examples live.
