---
name: lisa-sync-down
description: "Back-sync an environment branch down the deploy chain (hotfix propagation) on demand"
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:sync-down`
- Codex invocation: `$lisa-sync-down` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[source-env-or-branch]`
- Claude allowed tools: `Skill`. Codex tool access is governed by the active Codex runtime and project policy.

Use the /lisa:sync-down skill to back-sync an environment branch down the deploy chain — deriving the source→target chain from `.lisa.config.json` `deploy.order` + `deploy.branches`, then merging, resolving conflicts, opening PRs, and enabling auto-merge for each downward hop. Use the user's surrounding request as this command's arguments.
