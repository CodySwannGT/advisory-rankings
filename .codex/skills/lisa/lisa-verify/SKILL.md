---
name: lisa-verify
description: "Ship and verify code. Commits, opens PR, handles review loop, merges, monitors deploy, and runs remote verification in target environment. Folds in /ship."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:verify`
- Codex invocation: `$lisa-verify` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[commit-message-hint]`

Use the /lisa:verify skill to commit, push, PR, merge, deploy, and verify in the target environment. Use the user's surrounding request as this command's arguments.
