---
type: playbook
created: 2026-05-23
updated: 2026-05-23
related:
  - ../architecture/project-architecture.md
  - ../architecture/harper-fabric-operations.md
sources:
  - ../sources/documentation/2026-05-23-initial-project-docs.md
---

# Local operations

## When to use

Use this playbook when building, testing, seeding, verifying, deploying, or smoke-testing the
AdvisorBook Harper app from a local checkout.

## Steps

1. Use Bun; the repo declares `bun@1.3.11` and rejects npm/yarn/pnpm via `package.json` engines.
2. Run `bun run build` to compile TypeScript and generate Harper deploy assets.
3. For local data setup, run `bun run seed` and then `bun run verify`.
4. For Fabric REST paths, run `bun run seed:rest` and `bun run verify:rest`.
5. For UI smoke checks, run `bun run smoke`; for deployed smoke checks, set `BASE_URL` to the dev app
   URL before running the same command.
6. For normal code verification, run `bun run typecheck`, `bun run test`, and `bun run test:cov`.

## Verification

The expected local gate for normal changes is build, typecheck, test, and coverage. Deploy or
UI-facing changes also need smoke coverage against local or deployed targets. Source:
wiki/sources/documentation/2026-05-23-initial-project-docs.md.

## Pitfalls

- Generated deploy JavaScript belongs under `harper-app/` but is ignored by git.
- Do not rotate or commit deploy credentials; update the Fabric runbook metadata when credential
  handling changes.
- UI verification should use real entity IDs from `/Feed` and cover desktop plus mobile when layout
  changes.
