---
name: lisa-plugin-sync-explain
description: "Explain plugin source/generated drift and marketplace registration gaps without modifying the working tree."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:plugin-sync-explain`
- OpenCode invocation: `$lisa-plugin-sync-explain` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[path]`

Use the /lisa:plugin-sync-explain skill to inspect plugin source/generated synchronization for the current Lisa repo. Use the user's surrounding request as this command's arguments.

This command is read-only. It reports source-not-built edits, generated-only edits, marketplace registration drift, and the next source-first remediation step before an operator runs `bun run build:plugins` or `bun run check:plugins`.
