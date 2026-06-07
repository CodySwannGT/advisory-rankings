---
name: "morgan-stanley-advisor-scraper"
description: "Run the scheduled AdvisorBook Morgan Stanley advisor locator import. Uses the repo's scrape:morgan-stanley command, prefers credentialed writes, falls back to a capped dry run, verifies Harper, and reports counts/errors."
---

# Morgan Stanley Advisor Scraper

Use this skill for the recurring AdvisorBook Morgan Stanley advisor locator
import. It runs the existing scraper; use `firm-advisor-scraper` when changing
or adding scraper implementation code.

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

Prefer a real write when Harper/Fabric credentials are available:

```bash
bun run scrape:morgan-stanley -- --write --max-advisors 500 --page-size 50
```

If credentials are unavailable, run a capped dry run and clearly report that no
write occurred:

```bash
bun run scrape:morgan-stanley -- --max-advisors 25
```

Do not invent credentials and do not treat missing `HDB_*` variables alone as
proof credentials are absent; the repo can resolve Harper credentials from its
normal credential helpers.

## Verify And Report

After a write, verify with the matching target:

```bash
bun run verify:rest
bun run verify
```

Report row counts, whether the run wrote or dry-ran, verification results, and
feed/API errors.
