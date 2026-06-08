---
name: lisa-setup-jira
description: "Set up JIRA as the tracker for this project. Writes `jira.project` and offers to set top-level `tracker: \"jira\"` in `.lisa.config.json`. Depends on /lisa:setup:atlassian (needs cloudId)."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:setup:jira`
- OpenCode invocation: `$lisa-setup-jira` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[--project=<KEY>]`
- Claude allowed tools: `Skill`. OpenCode tool access is governed by the active OpenCode runtime and project policy.

Use the /lisa:setup-jira skill to configure JIRA as the project tracker. Use the user's surrounding request as this command's arguments.
