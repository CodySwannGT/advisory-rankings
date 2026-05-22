---
name: lisa-setup-confluence
description: "Set up Confluence as the PRD source for this project. Writes the `confluence` section of `.lisa.config.json` (spaceKey and/or parentPageId) and offers to set top-level `source: \"confluence\"`. Depends on /lisa:setup:atlassian."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:setup:confluence`
- Codex invocation: `$lisa-setup-confluence` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[--space=<KEY>] [--parent=<pageId>]`
- Claude allowed tools: `Skill`. Codex tool access is governed by the active Codex runtime and project policy.

Use the /lisa:setup-confluence skill to configure Confluence as the PRD source. Use the user's surrounding request as this command's arguments.
