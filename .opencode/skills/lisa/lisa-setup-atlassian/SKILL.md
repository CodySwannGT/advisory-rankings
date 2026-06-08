---
name: lisa-setup-atlassian
description: "Set up Atlassian (cloudId + acli profile) for this project. Writes the `atlassian` section of `.lisa.config.json` and enables the Atlassian MCP and/or installs acli as needed. Prerequisite for /lisa:setup:jira and /lisa:setup:confluence."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:setup:atlassian`
- OpenCode invocation: `$lisa-setup-atlassian` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[--site=<site>] [--email=<email>]`
- Claude allowed tools: `Skill`. OpenCode tool access is governed by the active OpenCode runtime and project policy.

Use the /lisa:setup-atlassian skill to configure Atlassian access for this project. Use the user's surrounding request as this command's arguments.
