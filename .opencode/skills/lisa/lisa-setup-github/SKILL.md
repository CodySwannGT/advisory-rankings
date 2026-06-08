---
name: lisa-setup-github
description: "Set up GitHub Issues as the tracker and/or PRD source for this project. Verifies the gh CLI, resolves org/repo, scaffolds the `status:*` (build) and/or `prd-*` (PRD) label namespaces, writes the `github` section of `.lisa.config.json`, and can document optional GitHub ProjectV2 coordination before offering top-level `tracker: \"github\"` / `source: \"github\"`. No /lisa:setup:atlassian prerequisite."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:setup:github`
- OpenCode invocation: `$lisa-setup-github` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[--repo=<org/repo>]`
- Claude allowed tools: `Skill`. OpenCode tool access is governed by the active OpenCode runtime and project policy.

Use the /lisa:setup-github skill to configure GitHub as the tracker and/or PRD source. Use the user's surrounding request as this command's arguments.
