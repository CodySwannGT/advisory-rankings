---
name: lisa-setup-automations
description: "Set up the recurring Lisa automations on the local workstation using the runtime's native scheduler (Codex automations / Claude /schedule): intake-repair (60 min), intake PRD (60 min), intake tickets (10 min), exploratory-bugs (daily), exploratory-prds (daily). A declarative spec — it states what to schedule and how often; the runtime's native automation mechanism does the creating. auto-start-prds / auto-start-tickets control whether ideated PRDs / filed bug tickets are created auto-pickup-ready (default: left for human review)."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:setup-automations`
- Codex invocation: `$lisa-setup-automations` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[auto-start-prds=true|false] [auto-start-tickets=true|false]`

Use the /lisa:setup-automations skill to create the five recurring Lisa automations via this runtime's native scheduler (Codex automations / Claude /schedule), passing the auto-start-prds / auto-start-tickets flags through to the exploratory automations. Use the user's surrounding request as this command's arguments.
