---
name: lisa-fix-linter-error
description: "Fix all violations of one or more ESLint rules across the codebase"
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:fix:linter-error`
- OpenCode invocation: `$lisa-fix-linter-error` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `<rule-1> [rule-2] [rule-3] ...`
- Claude allowed tools: `Skill`. OpenCode tool access is governed by the active OpenCode runtime and project policy.

Use the /lisa-rails:fix-linter-error skill to fix linter errors. Use the user's surrounding request as this command's arguments.
