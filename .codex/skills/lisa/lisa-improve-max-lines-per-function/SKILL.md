---
name: lisa-improve-max-lines-per-function
description: "Reduce max lines per function threshold and fix violations"
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:improve:max-lines-per-function`
- Codex invocation: `$lisa-improve-max-lines-per-function` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `<max-lines-per-function-value>`
- Claude allowed tools: `Skill`. Codex tool access is governed by the active Codex runtime and project policy.

Use the /lisa-rails:improve-max-lines-per-function skill to reduce max function lines. Use the user's surrounding request as this command's arguments.
