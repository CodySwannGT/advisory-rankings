---
name: lisa-pull-request-review
description: "Address and resolve PR review comments (human + bot): implement valid feedback, reply to invalid, resolve every thread."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:pull-request:review`
- Codex invocation: `$lisa-pull-request-review` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[github-pr-link-or-number]`
- Claude allowed tools: `Skill`. Codex tool access is governed by the active Codex runtime and project policy.

Use the /lisa:pull-request-review skill to address and resolve the code review feedback on a pull request — implement valid comments, reply to invalid ones, and resolve every thread via GraphQL. Use the user's surrounding request as this command's arguments.
