---
name: lisa-parity-sentry-sdk-setup
description: "Install and configure the Sentry SDK for a project — detect the framework, add the right @sentry/<framework> package, init the client, wire the DSN via env, enable error + performance monitoring, and set up source maps. One consolidated skill covering react, nextjs, node, nestjs, python, react-native, and more."
---
## Lisa Command Compatibility

- Original Claude command: `/lisa:parity-sentry-sdk-setup`
- OpenCode invocation: `$lisa-parity-sentry-sdk-setup` or a plain-English request that matches this skill.
- Treat the user's surrounding request as the command arguments.
- Claude argument hint: `[framework override, e.g. nextjs | node | python] (auto-detected if omitted)`

Use the /lisa:parity-sentry-sdk-setup skill to detect the framework and install + configure the correct Sentry SDK with error and performance monitoring and source maps. Use the user's surrounding request as this command's arguments.
