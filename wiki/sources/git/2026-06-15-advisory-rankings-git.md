---
type: source
created: 2026-06-15
updated: 2026-06-15
related: []
sources: []
source_system: git
project: advisory-rankings
---

# git history - advisory-rankings (2026-06-15)

- Repo: `/Users/codysai/.codex/worktrees/9525/advisory-rankings`
- HEAD: `0abf8f28110317b4e917241d25adc4c6e21b03a7`
- Total commits on HEAD: 1623
- New commits since last ingest (`e8eabb9a01936c9731cdb0531f09ee170c02f617`): 10
- Merged PRs: 20 recent merged PR(s) in CodySwannGT/advisory-rankings; latest #1242 "Restore root static serving"

## New commits

- 0d7526f - 2026-06-14 - docs: ingest latest wiki sources
- 1e6cbd0 - 2026-06-14 - Merge pull request #1240 from CodySwannGT/codex/wiki-ingest/2026-06-14
- f567ace - 2026-06-14 - chore(release): 0.1.437 [skip ci]
- 20736ff - 2026-06-14 - fix: route unknown documents after static assets
- 3fe5cb7 - 2026-06-14 - docs: align deploy static snippet
- 762ad20 - 2026-06-14 - Merge pull request #1241 from CodySwannGT/codex/1155-unknown-route-shell
- 8f011cd - 2026-06-14 - chore(release): 0.1.438 [skip ci]
- 01ddb44 - 2026-06-14 - revert: restore root static serving
- 0b769cc - 2026-06-14 - Merge pull request #1242 from CodySwannGT/codex/revert-1241-static-root
- 0abf8f2 - 2026-06-14 - chore(release): 0.1.439 [skip ci]

## Recent merged PRs

- #1242 - Restore root static serving - merged 2026-06-14T16:31:23Z - https://github.com/CodySwannGT/advisory-rankings/pull/1242
- #1241 - Fix unknown document route recovery - merged 2026-06-14T16:22:17Z - https://github.com/CodySwannGT/advisory-rankings/pull/1241
- #1240 - docs: ingest latest wiki sources - merged 2026-06-14T13:51:36Z - https://github.com/CodySwannGT/advisory-rankings/pull/1240
- #1239 - Fix firm profile source copy - merged 2026-06-14T01:16:34Z - https://github.com/CodySwannGT/advisory-rankings/pull/1239
- #1237 - Hide public analyst nav and align Browse rails - merged 2026-06-14T00:32:14Z - https://github.com/CodySwannGT/advisory-rankings/pull/1237
- #1236 - Link firm branch coverage - merged 2026-06-13T23:08:53Z - https://github.com/CodySwannGT/advisory-rankings/pull/1236
- #1235 - Add branch explorer regression coverage - merged 2026-06-13T21:10:32Z - https://github.com/CodySwannGT/advisory-rankings/pull/1235
- #1234 - Fix raw feed category metadata in deployed smoke - merged 2026-06-13T20:13:46Z - https://github.com/CodySwannGT/advisory-rankings/pull/1234
- #1233 - Fix research queue row wrapping - merged 2026-06-13T19:12:50Z - https://github.com/CodySwannGT/advisory-rankings/pull/1233
- #1232 - Fix feed category copy - merged 2026-06-13T17:22:23Z - https://github.com/CodySwannGT/advisory-rankings/pull/1232

## Notes

- The previous wiki ingest PR #1240 merged and was followed by release marker 0.1.437.
- PR #1241 attempted unknown-document route recovery by routing unknown documents after static assets and updating Fabric deployment notes, but PR #1242 immediately reverted that behavior to restore root static serving.
- The current durable operational state is the post-revert static-serving arrangement documented in `docs/fabric-runbook.md` and `harper-app/README.md`.
