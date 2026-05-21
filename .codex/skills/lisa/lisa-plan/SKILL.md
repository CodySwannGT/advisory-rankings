---
name: lisa-plan
description: "Plan work from a single PRD or specification. Decomposes into ordered work items in the configured tracker (JIRA, GitHub Issues, or Linear per .lisa.config.json). Source can be a Notion / Confluence / Linear / GitHub Issue URL, a JIRA epic key, a markdown file, or a free-form description. For batch scanning of all Ready PRDs in a queue, use /lisa:intake instead."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:plan`
- Codex invocation: `$lisa-plan` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `<single-PRD-url | GitHub-issue-url | @file | ticket-id-or-url | description>`

Use the /lisa:plan skill to decompose the PRD/spec into ordered work items in the configured tracker. Use the user's surrounding request as this command's arguments.
