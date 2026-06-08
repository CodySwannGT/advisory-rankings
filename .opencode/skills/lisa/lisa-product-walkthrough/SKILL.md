---
name: lisa-product-walkthrough
description: "Walk through the live product via a real browser (Playwright MCP) to ground PRD evaluation or ticket creation in what exists today. Captures current behavior, design-vs-product divergence, reuse candidates, and behavioral surprises."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:product-walkthrough`
- OpenCode invocation: `$lisa-product-walkthrough` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `<route or feature area to walk>`
- Claude allowed tools: `Skill`. OpenCode tool access is governed by the active OpenCode runtime and project policy.

Use the /lisa:product-walkthrough skill to walk through the live product, capture current state, and produce findings that ground PRD/ticket reasoning. Use the user's surrounding request as this command's arguments.
