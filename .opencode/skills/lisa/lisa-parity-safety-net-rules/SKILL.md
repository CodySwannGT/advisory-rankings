---
name: lisa-parity-safety-net-rules
description: "View, set, and verify the custom guard rules enforced by Lisa's safety-net PreToolUse Bash hook — the cross-agent equivalent of the upstream safety-net plugin's set/verify-custom-rules skills."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:parity-safety-net-rules`
- OpenCode invocation: `$lisa-parity-safety-net-rules` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[view | set <regex> | verify]`

Use the /lisa:parity-safety-net-rules skill to view, set, or verify the project-local custom guard rules enforced by Lisa's safety-net Bash hook (`parity-safety-net.sh`). Use the user's surrounding request as this command's arguments.
