---
name: "advisorbook-intake-prd"
description: "Run the cron-safe AdvisorBook GitHub PRD-intake cycle through Lisa. Processes at most one eligible PRD item using the repo-local Lisa intake configuration."
---

# AdvisorBook Intake PRD

Use this skill for the recurring AdvisorBook PRD-intake automation.

Invoke Lisa intake for the advisory-rankings repo with:

```text
$lisa-intake github intake_mode=prd
```

Follow the repo-local `.lisa.config.json`. Preserve cron safety: process at
most one eligible item, never ask for confirmation, and report processed, idle,
or blocked with the exact reason.
