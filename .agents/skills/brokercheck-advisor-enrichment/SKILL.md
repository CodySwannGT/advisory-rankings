---
name: "brokercheck-advisor-enrichment"
description: "Run the scheduled AdvisorBook BrokerCheck enrichment cycle for existing Advisor rows missing FINRA CRDs. Uses Bun, respects the 7-day state skip, avoids force mode, verifies Harper writes, and reports match/load counts."
---

# BrokerCheck Advisor Enrichment

Use this skill for the recurring AdvisorBook BrokerCheck enrichment automation.
It resolves existing advisors missing `finraCrd` values and loads
regulator-of-record data into Harper.

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

## Enrich Existing Advisors

```bash
bun run brokercheck -- --enrich --max 20
```

Respect the 7-day skip state. Do not pass `--force` unless the user explicitly
requests it in a future run.

BrokerCheck wins for regulatory facts. Preserve regulator provenance through
the repo's existing BrokerCheck loader paths.

## Verify And Report

Verify with deployed REST credentials when available; otherwise use local
verification only when local Harper is running:

```bash
bun run verify:rest
bun run verify
```

Report matched, no-match, ambiguous, and loaded counts; BrokerCheck block or
rate-limit responses; verification status; and runtime or credential blockers.
