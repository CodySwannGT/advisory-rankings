---
name: "firm-source-major-imports"
description: "Run the scheduled AdvisorBook major firm-source import cycle in Codex automation. Uses the repo's firm-source:major-imports command for Morgan Stanley, Wells Fargo, Merrill, RBC, Raymond James, Edward Jones, Stifel, and UBS with bounded writes and deployed verification."
---

# Firm Source Major Imports

Use this skill for the recurring AdvisorBook major firm-source import
automation. This is the scheduled path; GitHub Actions may keep manual
`workflow_dispatch` for operator-triggered runs, but must not own cron
scheduling.

## Pre-flight

Before repo work, ensure the automation checkout is current:

1. Inspect `git status --short`.
2. If the only dirty path is `eslint.ignore.config.json` and its only diff is
   the project-bootstrap removal of the `.codex/**` ignore entry, restore that
   file and continue.
3. For any other dirty path or diff, stop and report the blocker without
   changing repo or external state.
4. Run `git fetch origin --prune` and `git rebase origin/main`; stop on failure
   or conflicts.

Use Bun:

```bash
bun run build
```

## Import

Run the bounded major firm importer in write mode:

```bash
bun run firm-source:major-imports -- --max-advisors 25 --write
```

The importer covers Morgan Stanley, Wells Fargo Advisors, Merrill / Bank of
America, RBC Wealth Management, Raymond James, Edward Jones, Stifel, and UBS
Wealth Management USA. It writes `summary.json` plus per-adapter artifacts
under `artifacts/firm-source-imports/<run-id>`.

Do not run individual firm scrapers separately in this scheduled cycle. Do not
raise `--max-advisors` unless the user explicitly asks.

## Verify And Report

After writes, verify deployed data when credentials are available:

```bash
bun run verify:rest
bun run data:coverage
```

Report the artifact directory, per-adapter status, dry-run row counts,
write-touched counts, verification status, coverage highlights, and source or
credential blockers.
