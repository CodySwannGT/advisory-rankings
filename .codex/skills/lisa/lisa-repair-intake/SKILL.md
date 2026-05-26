---
name: lisa-repair-intake
description: "Repair counterpart to /lisa:intake. Vendor-agnostic batch scanner that finds stuck or half-closed work — items left in `blocked`, stalled in an in-progress role (build `claimed`, PRD `in_review`), terminal-labeled items still natively open, and rollups whose children are all terminal — across the same queues /lisa:intake serves (Notion / Confluence / Linear / GitHub PRDs; JIRA / GitHub / Linear build issues). Repairs every materially actionable candidate inside the `max_candidates` cap: resumes stalled in-progress work in place, re-validates blocked PRDs, re-dispatches blocked build items whose blockers have cleared, performs terminal native closure, and closes out completed rollups. Cron-safe and bounded; default GitHub intake_mode is both and default max_candidates is 100."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:repair-intake`
- Codex invocation: `$lisa-repair-intake` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `<Notion-PRD-database-URL | Confluence-space-URL | Confluence-parent-page-URL | Linear-workspace-URL | Linear-team-URL | GitHub-repo-URL | org/repo | JIRA-project-key | JQL-filter> [intake_mode=prd|build|both] [stale_after=24h] [max_candidates=100] [force=true]`

Use the /lisa:repair-intake skill to scan the queue for stuck or half-closed items and repair every materially actionable candidate inside `max_candidates` (default 100). For GitHub queues, default `intake_mode` to `both` when the caller omits it. Use the user's surrounding request as this command's arguments.
