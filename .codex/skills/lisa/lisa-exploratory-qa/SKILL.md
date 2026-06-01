---
name: lisa-exploratory-qa
description: "Run a first-time-user exploratory QA walkthrough: experience the app like a brand-new human user, clicking through to find anything confusing, broken, or hard to understand (human-facing jargon, contextless extracted data, machine-style labels, slow or unclear loads, late meaningful content, cramped or cut-off UI, inconsistent UX, awkward scroll behavior) across all breakpoints, and file each finding (bug or usability issue) as a tracked work item via lisa:tracker-write. The optional ready flag marks tickets build-ready (auto-picked-up by lisa:intake) or leaves them in the backlog for human triage (default). For gaps in the automated Playwright suite, use e2e-coverage-gaps instead."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:exploratory-qa`
- Codex invocation: `$lisa-exploratory-qa` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[target-url | env] [ready=true|false]`
- Claude allowed tools: `Skill`. Codex tool access is governed by the active Codex runtime and project policy.

Use the /lisa-rails:exploratory-qa skill to experience the app like a brand-new first-time user — landing cold on the home page and clicking through to find anything confusing, broken, or hard to understand across all breakpoints — and file each finding (bugs, usability/clarity issues) as a tracked work item via lisa:tracker-write, build-ready or in triage per the ready flag (default: triage). For automated Playwright coverage gaps, use /lisa-rails:e2e-coverage-gaps. Use the user's surrounding request as this command's arguments.
