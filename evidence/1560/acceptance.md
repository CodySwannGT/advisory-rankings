# Issue 1560 Acceptance Evidence

Recorded: 2026-07-07T09:20:45Z

## Scenario: Role map is committed at the component root

Status: pass

- `harper-app/roles.yaml` declares `app_user` as non-`super_user`.
- `tests/harper_role_map.test.ts` asserts the role grants read-only access to
  every `@table @export` type in `harper-app/schema.graphql`.
- The same test asserts no direct grants exist for `User`, `UserRating`,
  `AdvisorCorrectionRequest`, `UserWatchlist`, or `UserWatchlistEntry`.

## Scenario: A non-admin app_user cannot write an @export table

Status: pass

- `bun run smoke:rbac` attempted `PUT /Advisor/rbac-denied-fa77f5c9-95f0-47ed-921d-071a7aa9b2a9`
  against the deployed dev backend using non-admin `app_user` credentials.
- The request returned `403`, and the smoke printed `app_user write-denial smoke passed`.

## Scenario: CI fails when the deployed role drifts from the committed map

Status: pass with pre-deploy drift observed

- `.github/workflows/deploy.yml` now runs `bun run check:roles` after deploying
  `harper-app`.
- `src/scripts/check_roles.ts` reads live `list_roles` through the Studio
  control-plane proxy and compares it with `harper-app/roles.yaml`.
- Local pre-deploy run failed as expected because the current deployed role is
  missing the newly committed `BranchCoverage` read grant:
  `missing live table grant: BranchCoverage`.

## Scenario: Enabling the roles extension preserves all existing extensions

Status: pass

- `harper-app/config.yaml` now declares `roles.files: roles.yaml` and preserves
  `graphqlSchema`, `rest`, `jsResource`, `fastifyRoutes`, and `static`.
- `tests/harper_role_map.test.ts` asserts all six deploy-required extension
  keys are present.

## Verification Commands

- `bun test tests/harper_role_map.test.ts`: pass, 8 tests.
- `bun run build`: pass.
- `bun run typecheck`: pass.
- `bun run test`: pass, 113 files / 725 tests before final helper-branch coverage additions; covered again by `bun run test:cov`.
- `bun run test:cov`: pass, 113 files / 728 tests; 96.38% statements / 90.06% branches / 97.35% functions / 97.75% lines.
- `bun run check:roles`: expected pre-deploy failure, `missing live table grant: BranchCoverage`.
- `bun run smoke:rbac`: pass, deployed non-admin write denied with 403.
