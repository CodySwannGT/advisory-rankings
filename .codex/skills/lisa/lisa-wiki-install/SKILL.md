---
name: lisa-wiki-install
description: "Enable the LLM Wiki kernel (lisa-wiki plugin) in this project so its setup skill becomes discoverable. Edits .claude/settings.json to enable lisa-wiki@lisa and confirm the CodySwannGT/lisa marketplace, then verifies the Codex overlay (.codex/skills/lisa) already carries the wiki kernel. Does NOT scaffold the wiki itself — after install, reload the runtime and run /setup:wiki (Claude) or $lisa-wiki-setup (Codex)."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:wiki:install`
- Codex invocation: `$lisa-wiki-install` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude allowed tools: `Skill`. Codex tool access is governed by the active Codex runtime and project policy.

Use the /lisa:wiki-install skill to enable the lisa-wiki plugin in this project. Use the user's surrounding request as this command's arguments.
