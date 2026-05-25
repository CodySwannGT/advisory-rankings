---
name: lisa-exploratory-qa
description: "Run a Playwright-backed exploratory QA pass: audit the app like a human, find user-noticeable bugs, usability issues, and gaps in automated test coverage, and file each finding as a tracked work item via lisa:tracker-write. The optional ready flag marks bug/suggestion tickets build-ready (auto-picked-up by lisa:intake) or leaves them in the backlog for human triage (default); missing-test tickets are always build-ready."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:exploratory-qa`
- Codex invocation: `$lisa-exploratory-qa` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[target-url | env] [ready=true|false]`
- Claude allowed tools: `Skill`. Codex tool access is governed by the active Codex runtime and project policy.

Use the /lisa-rails:exploratory-qa skill to run a human-style exploratory QA pass informed by the existing Playwright suite, then file every finding (bugs, usability issues, missing Playwright tests) as a tracked work item via lisa:tracker-write — bug/suggestion tickets build-ready or in triage per the ready flag (default: triage), missing-test tickets always build-ready. Use the user's surrounding request as this command's arguments.
