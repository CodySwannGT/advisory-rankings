# Advisory Rankings Operational Brain - Log

> Append-only. One row per operation. Operations:
> `INIT, SETUP, INGEST, CREATE, UPDATE, MERGE, DEPRECATE, LINT, QUERY, REBUILD-INDEX`.

| Date | Operation | Target | Notes |
|---|---|---|---|
| 2026-05-23 | SETUP | wiki/ | Initialized Advisory Rankings Operational Brain with the lisa-wiki kernel. |
| 2026-05-23 | INGEST | wiki/sources/git/2026-05-23-advisory-rankings-git.md | Initial git history ingest captured 135 commits and recent merged PR metadata. |
| 2026-05-23 | INGEST | wiki/sources/documentation/2026-05-23-initial-project-docs.md | Initial documentation ingest mapped README, docs, runbooks, design system, BrokerCheck, Harper app, and research notes. |
| 2026-05-23 | UPDATE | wiki/index.md | Added initial synthesis pages and source-note entries. |
| 2026-05-25 | UPDATE | wiki/lisa-wiki.config.json | Enabled PR-per-ingestion and auto-merge for wiki ingestion publishing. |
| 2026-05-25 | UPDATE | wiki/schema/llm-wiki-contract.md | Re-rendered the contract from config with PR-per-ingestion auto-merge policy. |
| 2026-05-25 | INGEST | wiki/sources/documentation/2026-05-25-advisorbook-personas.md | Captured user seed personas plus app, docs, and deployed-resource evidence. |
| 2026-05-25 | CREATE | wiki/requirements/advisorbook-personas.md | Synthesized evidence-grounded AdvisorBook personas for product ideation. |
| 2026-05-25 | UPDATE | wiki/index.md | Added the AdvisorBook personas requirement page and documentation source note. |
