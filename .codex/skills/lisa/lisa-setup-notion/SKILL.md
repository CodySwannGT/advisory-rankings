---
name: lisa-setup-notion
description: "Set up Notion as the PRD source for this project. Walks the user through creating a workspace-scoped internal-integration token, sharing the PRD database with it, and stores the token in OS keychain. Writes `notion.workspaceId`, `notion.prdDatabaseId`, and `notion.values` into `.lisa.config.json`. Offers to set top-level `source: \"notion\"`."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:setup:notion`
- Codex invocation: `$lisa-setup-notion` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[--database=<uuid>] [--workspace=<slug>]`
- Claude allowed tools: `Skill`. Codex tool access is governed by the active Codex runtime and project policy.

Use the /lisa:setup-notion skill to configure Notion as the PRD source. Use the user's surrounding request as this command's arguments.
