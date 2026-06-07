---
name: "advisorbook-intake-build"
description: "Run the cron-safe AdvisorBook GitHub build-intake cycle through Lisa. Processes at most one eligible build issue using the repo-local Lisa intake configuration."
---

# AdvisorBook Intake Build

Use this skill for the recurring AdvisorBook build-intake automation.

Invoke Lisa intake for the advisory-rankings repo with:

```text
$lisa-intake github intake_mode=build
```

Follow the repo-local `.lisa.config.json`. Preserve cron safety: process at
most one eligible item, never ask for confirmation, and report processed, idle,
or blocked with the exact reason.
