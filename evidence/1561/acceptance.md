# Issue 1561 Acceptance Evidence

Run time: 2026-07-07T12:42:19Z

## Scenario: Each of the four endpoints has a recorded authorization decision

Status: pass

- `DataCoverage`: intentionally public in code and `docs/fabric-runbook.md`.
- `AdvisorResearchQueue`: intentionally public in code and `docs/fabric-runbook.md`.
- `SourceArticleTriage`: intentionally public in code and `docs/fabric-runbook.md`.
- `RecruitingDealDataGaps`: intentionally public in code and `docs/fabric-runbook.md`.

## Scenario: An analyst-gated endpoint hides data from a signed-in non-analyst

Status: not applicable

The implementation decision for all four target endpoints is intentionally public.
The existing analyst-gated reference behavior remains covered by
`RegulatoryDiscrepancyQueue` tests, including the signed-in non-analyst empty
envelope.

## Scenario: An analyst-gated endpoint returns empty to anonymous callers

Status: not applicable

The implementation decision for all four target endpoints is intentionally public.
The existing analyst-gated reference behavior remains covered by
`RegulatoryDiscrepancyQueue` tests, including the anonymous empty envelope.

## Scenario: An intentionally-public endpoint documents why

Status: pass

Each target resource has an `allowRead()` rationale in source, and the
runbook public endpoint table records the public decision plus the data-exposure
rationale.

## Verification Commands

- `bunx vitest run tests/harper_resources.test.ts -t "keeps selected ops queue resources intentionally public-safe"`: pass
- `bun run build`: pass
- `bun run typecheck`: pass
- `bun run test`: pass
- `bun run test:cov`: pass, 96.35% statements / 90% branches / 97.32% functions / 97.74% lines
- `bun run smoke`: failed because no local Harper server was listening on `127.0.0.1:9926`.
- `BASE_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com bun run smoke`: inconclusive. The cluster stability precheck passed, then the browser run was interrupted after a long hang and a `Request context disposed` first-attempt failure.
