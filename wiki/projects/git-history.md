---
type: project
created: 2026-05-23
updated: 2026-05-26
related:
  - ../architecture/project-architecture.md
sources:
  - ../sources/git/2026-05-23-advisory-rankings-git.md
  - ../sources/git/2026-05-25-advisory-rankings-git.md
  - ../sources/git/2026-05-26-advisory-rankings-git.md
---

# Git history

## Initial ingest window

The first Lisa wiki git ingest ran on 2026-05-23 at HEAD
`af60905303d58ca596c75540e44453612c80c94e`. It captured 135 commits on HEAD and 20 recent merged
PRs from `CodySwannGT/advisory-rankings`; the latest merged PR was #62, "test: keep mobile smoke
focused on drawer." Source: wiki/sources/git/2026-05-23-advisory-rankings-git.md.

## Incremental ingest window

The next git ingest ran on 2026-05-25 at HEAD
`67c58eb2e015b5249a97b351736b674d9f4ef721`. It added 171 commits since the 2026-05-23 cursor,
bringing the branch total to 306 commits, and refreshed recent merged PR metadata through #214,
"chore: update @codyswann/lisa to 2.62.1." Source: wiki/sources/git/2026-05-25-advisory-rankings-git.md.

The 2026-05-26 git ingest ran at HEAD `3638640533b09fb984d9278e6a830a904205a6fb`. It added 57
commits since the 2026-05-25 cursor, bringing the branch total to 363 commits, and refreshed recent
merged PR metadata through #310, "Fix mobile drawer tab order." Source:
wiki/sources/git/2026-05-26-advisory-rankings-git.md.

## Recent themes

- Rankings explorer, recruiting-market, and firm due-diligence product surfaces.
- Async-state patterns, auth fallback behavior, and expanded smoke-test evidence.
- Public MCP endpoint, read-only tools/resources, and inspector/setup documentation.
- Firm-source adapter expansion across Merrill, Wells Fargo, RBC, Raymond James, Edward Jones, UBS, and Stifel.
- CI, release, and deploy hardening alongside repeated Lisa upgrades and tracker/workflow automation.
- Mobile drawer accessibility, route recovery/retry actions, recruiting watchlist and overflow
  hardening, advisor evidence panels, feed/search filters, and clean regulatory routes.
- Continued Lisa package upgrades, including the move from the 2.62.x wiki setup to 2.98.1 on
  2026-05-26.

## Use

Use this page as the wiki's current high-level project-history landing page. For exact commit lists,
consult the source notes. Sources: wiki/sources/git/2026-05-23-advisory-rankings-git.md and
wiki/sources/git/2026-05-25-advisory-rankings-git.md, and
wiki/sources/git/2026-05-26-advisory-rankings-git.md.
