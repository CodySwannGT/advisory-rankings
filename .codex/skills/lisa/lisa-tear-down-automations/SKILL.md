---
name: lisa-tear-down-automations
description: "Remove the recurring Lisa automations /setup-automations created for this project (the lisa-auto-<project>-* set) using the runtime's native scheduler (Codex automations / Claude /schedule). A declarative spec — it states which automations to remove; the runtime's native mechanism does the removing. Removes only this project's Lisa automations, never others."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:tear-down-automations`
- Codex invocation: `$lisa-tear-down-automations` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.

Use the /lisa:tear-down-automations skill to remove this project's lisa-auto-<project>-* automations via this runtime's native scheduler (Codex automations / Claude /schedule), leaving other projects' and non-Lisa automations untouched. Use the user's surrounding request as this command's arguments.
