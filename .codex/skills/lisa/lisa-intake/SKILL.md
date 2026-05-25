---
name: lisa-intake
description: "Vendor-agnostic batch scanner for Ready queues. Notion PRD database URL → finds Status=Ready PRDs and runs lisa:plan per item. Confluence space or parent-page URL → finds prd-ready PRDs and runs lisa:plan per item. Linear workspace or team URL → finds prd-ready Linear projects and runs lisa:plan per item. GitHub repo URL or org/repo token → finds prd-ready GitHub issues and runs lisa:plan per item (PRD-source mode), or finds status:ready issues and runs lisa:implement per item when tracker=github (build-queue mode). JIRA project key or JQL → finds Ready tickets and runs lisa:implement per item. Designed as the cron target for /schedule."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:intake`
- Codex invocation: `$lisa-intake` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `<Notion-PRD-database-URL | Confluence-space-URL | Confluence-parent-page-URL | Linear-workspace-URL | Linear-team-URL | GitHub-repo-URL | org/repo | JIRA-project-key | JQL-filter>`

Use the /lisa:intake skill to scan the queue for Ready items and dispatch one eligible Ready item per invocation through the appropriate single-item lifecycle skill — and, on the PRD side, close the loop by dispatching /lisa:verify-prd for one shipped PRD per cycle (shipped → verified on pass, or re-opened to ticketed with build-ready fix tickets that auto-build and re-verify on fail — never blocked). Use the user's surrounding request as this command's arguments.
