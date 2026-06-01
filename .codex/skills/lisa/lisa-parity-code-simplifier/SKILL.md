---
name: lisa-parity-code-simplifier
description: "Behavior-preserving simplification of recently-changed code — dedup, reuse, readability, and dead-code removal, quality only (never a bug hunt). Vendor-neutral cross-agent equivalent of the upstream code-simplifier agent."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:parity-code-simplifier`
- Codex invocation: `$lisa-parity-code-simplifier` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[optional: path or scope hint]`

Use the /lisa:parity-code-simplifier skill to simplify the recently-changed code — removing duplication and dead code, reusing existing utilities, and improving readability — without altering behavior, then verify tests still pass. Use the user's surrounding request as this command's arguments.
