---
name: "brokercheck-roster-crawl"
description: "Run the scheduled capped BrokerCheck firm snapshot and roster crawl for AdvisorBook. Uses Bun, respects state/rate limits, avoids force mode, verifies Harper writes, and reports crawl phase summaries."
---

# BrokerCheck Roster Crawl

Use this skill for the recurring AdvisorBook BrokerCheck roster crawl
automation. It runs the capped firm snapshot and roster orchestrator and keeps
the run resumable and rate-limit aware.

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

## Crawl

```bash
bun run brokercheck:crawl -- --max-per-firm 50 --max-runtime-seconds 7200
```

Do not pass `--force`. Respect the state file and BrokerCheck rate limits. If
BrokerCheck blocks or rate-limits the run, stop cleanly and report the response.

## Verify And Report

Verify with deployed REST credentials when available; otherwise use local
verification only when local Harper is running:

```bash
bun run verify:rest
bun run verify
```

Report phase summaries, fetched/skipped/error/block counts, resolver stats,
verification status, and access blockers.
