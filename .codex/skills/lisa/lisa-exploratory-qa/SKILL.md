---
name: lisa-exploratory-qa
description: "Run a Playwright-backed exploratory QA pass: audit the app like a human, find user-noticeable bugs and gaps in automated test coverage, and produce a QA gaps report."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:exploratory-qa`
- Codex invocation: `$lisa-exploratory-qa` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[target-url | env] [report-path]`
- Claude allowed tools: `Skill`. Codex tool access is governed by the active Codex runtime and project policy.

Use the /lisa-rails:exploratory-qa skill to run a human-style exploratory QA pass informed by the existing Playwright suite, then produce an actionable coverage-gaps report. Use the user's surrounding request as this command's arguments.
