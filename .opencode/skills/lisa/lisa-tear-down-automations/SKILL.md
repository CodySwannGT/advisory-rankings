---
name: lisa-tear-down-automations
description: "Remove the recurring LLM Wiki ingest automation /lisa-wiki:setup-automations created for this project (the lisa-wiki-auto-<project>-* set) using the runtime's native scheduler (Codex automations / Claude /schedule). A declarative spec — it states which automation to remove; the runtime's native mechanism does the removing. Removes only this project's wiki automation, never the base set or other projects'."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:tear-down-automations`
- OpenCode invocation: `$lisa-tear-down-automations` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.

Use the lisa-wiki-tear-down-automations skill to remove this project's lisa-wiki-auto-<project>-* automation via this runtime's native scheduler (Codex automations / Claude /schedule), leaving the base /lisa:setup-automations set, other projects', and non-Lisa automations untouched. Use the user's surrounding request as this command's arguments.
