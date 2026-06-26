---
type: source
created: 2026-06-26
updated: 2026-06-26
related: []
sources: []
source_system: git
project: advisory-rankings
---

# git history - advisory-rankings (2026-06-26)

- Repo: `advisory-rankings`
- HEAD: `d0ca3df1c20798a1dedac4e8ce6fb4f3ae5571d1`
- Total commits on HEAD: 1914
- New commits since last ingest (`07110052e154112c35444b7a6025ae7829fe7f86`): 12
- Merged PRs: 4 merged PR(s) since the last cursor; latest #1416 "Fix desktop login header search overlap"

## Recent merged PRs

- #1412 - test: harden advisor trust checklist assertions - merged 2026-06-25T07:11:26Z - https://github.com/CodySwannGT/advisory-rankings/pull/1412
- #1411 - docs: ingest latest wiki sources - merged 2026-06-25T07:14:12Z - https://github.com/CodySwannGT/advisory-rankings/pull/1411
- #1415 - refactor: reduce max-lines-per-function threshold - merged 2026-06-25T09:10:16Z - https://github.com/CodySwannGT/advisory-rankings/pull/1415
- #1416 - Fix desktop login header search overlap - merged 2026-06-25T10:19:07Z - https://github.com/CodySwannGT/advisory-rankings/pull/1416

## Commits

- bb09c99 - 2026-06-25 - docs: ingest latest wiki sources
- dca5a9f - 2026-06-25 - test: harden advisor trust checklist assertions
- 9fe8110 - 2026-06-25 - Merge pull request #1412 from CodySwannGT/test/nightly-trust-checklist-counts
- 2753e5f - 2026-06-25 - chore(release): 0.1.522 [skip ci]
- 72d7a43 - 2026-06-25 - Merge pull request #1411 from CodySwannGT/codex/wiki-ingest/2026-06-25
- 4c162ba - 2026-06-25 - chore(release): 0.1.523 [skip ci]
- 74a4e1c - 2026-06-25 - refactor: reduce max-lines-per-function threshold
- f9c57da - 2026-06-25 - Merge pull request #1415 from CodySwannGT/codex/reduce-max-lines-per-function-56
- aa6d47c - 2026-06-25 - chore(release): 0.1.524 [skip ci]
- cf497d5 - 2026-06-25 - fix: prevent desktop login header search overlap
- 76ce143 - 2026-06-25 - Merge pull request #1416 from CodySwannGT/codex/1410-header-search-overlap
- d0ca3df - 2026-06-25 - chore(release): 0.1.525 [skip ci]

## Notes

- The previous wiki ingest PR #1411 merged on 2026-06-25 and this window starts after cursor
  `07110052e154112c35444b7a6025ae7829fe7f86`.
- Trust checklist browser assertions were hardened after the deployed replay coverage landed, keeping
  the advisor-profile checklist path under explicit regression coverage.
- The max-lines-per-function threshold was reduced again as part of ongoing nightly maintainability
  pressure.
- Desktop login/header search overlap was fixed so the login affordance and global search control do
  not collide in the authenticated shell.
- Maintenance released app versions 0.1.522 through 0.1.525 across the merged PR window.
