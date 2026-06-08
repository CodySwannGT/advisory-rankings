---
name: lisa-cross-pollinate
description: "Detect locally-authored agent definitions and regenerate them in the formats of the other coding agents this project supports (per .lisa.config.json)."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:cross-pollinate`
- Codex invocation: `$lisa-cross-pollinate` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[path] [--dry-run] [--write]`
- Claude allowed tools: `Skill`. Codex tool access is governed by the active Codex runtime and project policy.

Use the /lisa:cross-pollinate skill to detect this project's locally-authored
coding-agent definitions (skills, subagents, rules, commands, hooks, MCP) and
make each available in the formats of the other agents the project's
`.lisa.config.json` harness includes. Use the user's surrounding request as this command's arguments.

Provenance is tracked in `.lisa/cross-pollination.lock.json`: the run is
idempotent, garbage-collects orphaned translations, never overwrites a
hand-edited target, and reports any conflict or unsupported translation rather
than guessing.
