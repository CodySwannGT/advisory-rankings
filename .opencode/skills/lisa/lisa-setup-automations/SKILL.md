---
name: lisa-setup-automations
description: "Set up the recurring LLM Wiki ingest automation on the local workstation using the runtime's native scheduler (Codex automations / Claude /schedule): wiki-ingest, a full /lisa-wiki:ingest cycle, once a day by default (override with cadence). A declarative spec — it states what to schedule and how often; the runtime's native automation mechanism does the creating. Named lisa-wiki-auto-<project>-* so it never collides with the base /lisa:setup-automations set. The wiki counterpart of /lisa:setup-automations, separate because the wiki plugin is standalone."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:setup-automations`
- OpenCode invocation: `$lisa-setup-automations` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[cadence=daily|weekly|every-<n>-hours]`

Use the lisa-wiki-setup-automations skill to create the recurring wiki-ingest automation via this runtime's native scheduler (Codex automations / Claude /schedule), running a full /lisa-wiki:ingest cycle on the resolved cadence (default daily) and naming it lisa-wiki-auto-<project>-ingest so teardown stays precise. Use the user's surrounding request as this command's arguments.
