---
name: lisa-parity-code-review
description: "Lisa-native code review of the current git diff — correctness bugs, security issues, and obvious defects, reported as severity-ranked findings with file:line references. Vendor-neutral cross-agent equivalent of the upstream code-review command."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:parity-code-review`
- OpenCode invocation: `$lisa-parity-code-review` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[optional: path or scope hint]`

Use the /lisa:parity-code-review skill to review the current branch and working-tree diff for correctness bugs, security issues, and obvious defects, and report findings ranked by severity with file:line references. Use the user's surrounding request as this command's arguments.
