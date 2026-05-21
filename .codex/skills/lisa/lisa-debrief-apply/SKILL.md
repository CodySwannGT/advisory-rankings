---
name: lisa-debrief-apply
description: "Apply human-marked dispositions from a Debrief triage document — route accepted learnings to their persistence destinations (Edge Case Brainstorm checklist, project rules, memory, tracker tickets). Reads the triage doc produced by /lisa:debrief; deterministic and idempotent."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:debrief:apply`
- Codex invocation: `$lisa-debrief-apply` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `<path to triage doc | URL>`

Use the /lisa:debrief:apply command (which invokes the `lisa:debrief-apply` skill) to read the triage document at Use the user's surrounding request as this command's arguments., parse human dispositions, and persist accepted learnings to their categorized destinations.
