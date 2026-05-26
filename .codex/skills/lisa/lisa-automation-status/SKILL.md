---
name: lisa-automation-status
description: "Inspect the current project's Lisa automation fleet and report whether the expected recurring jobs exist, match Lisa's setup contract, and show healthy recent activity. Read-only by default."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:automation-status`
- Codex invocation: `$lisa-automation-status` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.

Use the /lisa:automation-status skill to inspect the current project's expected Lisa automations, compare them with the runtime's scheduler metadata, and report fleet health, drift, staleness, unsupported jobs, and remediation hints. Use the user's surrounding request as this command's arguments.

Common operator usage:

- `/lisa:automation-status`
- `/lisa:automation-status --verbose`

This surface is read-only in v1. Use it to understand whether Lisa's unattended jobs are healthy before deciding whether to rerun `/lisa:setup-automations`, inspect scheduler errors, or use `/lisa:intake` / `/lisa:repair-intake` to address queue fallout.
