---
name: lisa-pull-request-review
description: "Checks for code review comments on a PR and implements them if required."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:pull-request:review`
- Codex invocation: `$lisa-pull-request-review` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `<github-pr-link>`
- Claude allowed tools: `Skill`. Codex tool access is governed by the active Codex runtime and project policy.

Use the /lisa:pull-request-review skill to check for code review comments and implement them. Use the user's surrounding request as this command's arguments.
