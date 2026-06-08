---
name: lisa-codify-verification
description: "Convert empirical verification into a regression test (Playwright for UI, integration test for API/DB, benchmark for performance, etc.) so it doesn't regress. Mandatory step after verification passes — invoked from verification-lifecycle and from each Build/Fix/Improve flow."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:codify-verification`
- OpenCode invocation: `$lisa-codify-verification` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `<verification-type> <what-was-verified>`

Use the /lisa:codify-verification skill to encode the empirical verification that just passed as a regression test, in the appropriate framework for the verification type. Use the user's surrounding request as this command's arguments.
