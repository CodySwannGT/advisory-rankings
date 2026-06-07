---
name: "advisor-public-web-research"
description: "Run the scheduled advisory-rankings public-web research cycle for due AdvisorResearchCheck rows. Uses deployed Harper, source-backed public sources only, records each checked advisor, and never scrapes LinkedIn pages."
---

# Advisor Public Web Research

Use this skill for the recurring AdvisorBook public-web research automation.
It selects due advisors, adds only source-backed soft facts, records every
advisor checked, and reports concise run evidence.

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

Use Bun and the deployed Harper target:

```bash
export HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com
bun run build
```

## Select Due Advisors

```bash
bun run research:advisors -- due --max 5 --stale-days 30 --json
```

Process only the selected advisors. Do not expand the batch.

## Research Rules

For each advisor, search high-signal public sources:

- firm bios and team pages
- ranking or list pages
- press releases and public announcements
- LinkedIn profile URL from search snippets only

Do not scrape LinkedIn pages. Do not write facts from unsupported snippets or
unsourced inference. Only write facts that can be backed by a source URL and
recorded as `FieldAssertion` provenance.

## Record Each Advisor

After every selected advisor, record the result so later runs can skip recent
checks:

```bash
bun run research:advisors -- record --advisor-id <id> --status <success|no_new_data|ambiguous|failed> --sources <comma-separated URLs> --notes <brief result>
```

Use `ambiguous` when identity or source evidence is unclear instead of guessing.

## Verify And Report

Run deployed verification when credentials are available:

```bash
bun run verify:rest
```

Report selected advisors, source URLs checked, facts added, statuses recorded,
verification status, and blockers.
