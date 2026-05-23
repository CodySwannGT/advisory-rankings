---
type: architecture
created: 2026-05-23
updated: 2026-05-23
related:
  - ../architecture/project-architecture.md
  - ../playbooks/local-operations.md
sources:
  - ../sources/documentation/2026-05-23-initial-project-docs.md
---

# AdvisorBook web UI design system

## Overview

The AdvisorBook UI uses an Atomic Design system under `src/web/design-system/`, emitted into
`harper-app/web/design-system/` during build. Pages should import UI components from
`src/web/design-system/index.ts`. Source: wiki/sources/documentation/2026-05-23-initial-project-docs.md.

## Layers

- Tokens define shared visual primitives.
- Atoms provide basic UI building blocks.
- Molecules compose atoms into repeated UI controls.
- Organisms define larger page sections and navigational structures.
- Templates organize page-level structure for directory, profile, article, feed, and auth views.

## Operating rule

UI changes should preserve the design system import boundary and verify generated local web assets
while proxying data/resource requests to the deployed dev backend when layout is touched. Source:
wiki/sources/documentation/2026-05-23-initial-project-docs.md.
