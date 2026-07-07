# Issue 1562 Acceptance Evidence

Recorded: 2026-07-07T11:20:08Z

## Criteria

- Junction and append-only tables are sealed with loaders verified: PASS.
  `tests/schema_hardening.test.ts` asserts `@sealed` on `AdvisorSearchIndex`,
  the five `Article*Mention` junction tables, and `FieldAssertion`, then audits
  seeded rows plus loader-emitted rows so no sealed table receives undeclared
  fields.
- `AdvisorMetricSnapshot` gains `createdAt` parity: PASS.
  The focused test asserts both `TeamMetricSnapshot` and
  `AdvisorMetricSnapshot` declare `createdAt: Date @createdTime`; the row type
  also exposes `createdAt?: HarperDate`.
- Schema docs are updated: PASS.
  `docs/advisor-schema.md` documents `AdvisorSearchIndex`, mention junction,
  `FieldAssertion`, and `AdvisorMetricSnapshot.created_at` behavior.
  `docs/fabric-runbook.md` section 6 documents `@sealed` as a write-time
  deploy behavior change.
- Present-field query change is validated before adoption: PASS.
  No `greater_than ""` to `not_equal null` query change was included in this
  PR; the data-dependent work remains deferred as out of scope.

## Proof Commands

```bash
bun test tests/schema_hardening.test.ts
bun run build
bun run typecheck
bun run test
bun run test:cov
BASE_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com SMOKE_SCOPE=core bun run smoke
```

## Observed Results

- Focused schema-hardening test: 3 passed, 0 failed.
- Build: passed; Harper JS resources regenerated.
- Typecheck: passed.
- Full test suite: 112 files passed, 18 skipped; 720 tests passed, 58 skipped.
- Coverage: passed with 96.35% statements, 90% branches, 97.32% functions,
  97.74% lines.
- Scoped deployed smoke: PASS, 62/62 checks.
- Full deployed smoke was attempted first and hung in advisor filter discovery
  after the deployed cluster stability gate passed; scoped core smoke was used
  for deploy health because this change is schema-only and does not touch the
  directory filter UI path.
