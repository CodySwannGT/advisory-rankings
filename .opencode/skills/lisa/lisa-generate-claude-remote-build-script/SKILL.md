---
name: lisa-generate-claude-remote-build-script
description: "Generate the setup/build script and environment-variable template to paste into a Claude Code remote routine environment so this repo runs in the cloud. Runs /lisa:analyze-claude-remote, then writes an idempotent, detect-before-install bash script that installs the required package manager and CLIs for Lisa and the host project, plus a commented env-var template (names only) and a domain allowlist. Cloud-proxy aware and fits the environment-cache time budget."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:generate-claude-remote-build-script`
- OpenCode invocation: `$lisa-generate-claude-remote-build-script` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[--out=<path>] [--include-optional] [--print]`

Use the /lisa:generate-claude-remote-build-script skill to generate the cloud-environment setup script and env-var template for running this repo as a Claude Code remote routine. Use the user's surrounding request as this command's arguments.
