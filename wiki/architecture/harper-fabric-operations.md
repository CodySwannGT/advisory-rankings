---
type: architecture
created: 2026-05-23
updated: 2026-05-23
related:
  - ../playbooks/local-operations.md
  - ../playbooks/brokercheck-operations.md
sources:
  - ../sources/documentation/2026-05-23-initial-project-docs.md
---

# Harper Fabric operations

## Overview

The deployed dev app is `https://advisory-rankings-de.cody-swann-org.harperfabric.com/`. The
operational docs treat `docs/fabric-runbook.md` as the practical deployment record for
`advisory-rankings-dev`, including topology, credentials handling, deployment workarounds, REST
seed/verify paths, and web UI smoke testing. Source:
wiki/sources/documentation/2026-05-23-initial-project-docs.md.

## Deployment model

The app uses a Harper component rooted at `harper-app/`. Harper reads GraphQL schema files, exposes
REST for exported tables, loads custom JS resources from `resources.js`, serves clean profile and
directory routes from generated route files, and serves the AdvisorBook static web UI from `web/**`.
Source: wiki/sources/documentation/2026-05-23-initial-project-docs.md.

## Operational constraints

- Generated deploy JavaScript is ignored by git and must be regenerated with `bun run build`.
- Fresh credentials must not be committed; credential rotation requires runbook updates.
- Network access to Harper operations port `:9925` may be blocked, so REST-based seed/verify paths
  exist for firewalled environments.
- UI verification should cover local generated assets while proxying data/resource requests to the
  deployed dev backend when layout changes.

## Verification surface

Normal local gates are `bun run build`, `bun run typecheck`, `bun run test`, and `bun run test:cov`.
Deploy or UI-facing work adds `bun run smoke` and deployed smoke checks with `BASE_URL` pointed at
the dev app. Source: wiki/sources/documentation/2026-05-23-initial-project-docs.md.
