---
name: lisa-parity-skill-creator
description: "Author a new Lisa skill end-to-end — scaffold the SKILL.md frontmatter, write the pass-through command, follow hyphen naming and placement under plugins/src, and rebuild plugins. Lisa-native equivalent of the upstream skill-creator plugin."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:parity-skill-creator`
- Codex invocation: `$lisa-parity-skill-creator` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `<skill-name and a one-line description of what it should do>`

Use the /lisa:parity-skill-creator skill to scaffold a new Lisa skill and its pass-through command, following frontmatter, naming, placement, and build conventions. Use the user's surrounding request as this command's arguments.
