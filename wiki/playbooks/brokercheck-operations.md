---
type: playbook
created: 2026-05-23
updated: 2026-05-23
related:
  - ../entities/advisor-domain-model.md
  - ../architecture/harper-fabric-operations.md
sources:
  - ../sources/documentation/2026-05-23-initial-project-docs.md
---

# BrokerCheck operations

## When to use

Use this playbook when working on BrokerCheck fetching, parsing, crawl orchestration, enrichment, or
loading into the advisor domain model.

## Steps

1. Treat `docs/brokercheck-spike.md` as the operating note for endpoint shapes, terms constraints,
   schema fit, crawler modes, wave orchestration, deduplication, idempotency, and resumability.
2. Use the scripts surfaced in `package.json`: `brokercheck`, `brokercheck:crawl`, and
   `smoke:brokercheck` for the relevant workflow.
3. Keep parser and loader changes aligned with `src/lib/brokercheck*.ts` and
   `src/scripts/*brokercheck*.ts`.
4. Update `docs/brokercheck-spike.md` when parsing, loading, fetching, or crawl orchestration changes.

## Verification

Run the relevant build/test/smoke path for the touched behavior. For UI or live-path checks, include
`bun run smoke:brokercheck` where applicable. Source:
wiki/sources/documentation/2026-05-23-initial-project-docs.md.

## Pitfalls

- BrokerCheck and AdvisorHub data can disagree; preserve reconciliation notes rather than silently
  overwriting values.
- Terms-of-use constraints are part of the operating model.
- Crawler state must remain idempotent and resumable.
