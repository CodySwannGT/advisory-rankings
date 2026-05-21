# Working in this repo

This is the first Harper/Fabric project managed by Lisa's
`harper-fabric` project type. Reusable stack rules live in Lisa; this
file keeps only advisory-rankings-specific operational facts.

## Project identity

- Repo: `CodySwannGT/advisory-rankings`
- Deployed dev app:
  `https://advisory-rankings-de.cody-swann-org.harperfabric.com/`
- Harper component root: `harper-app/`
- TypeScript source: `src/`
- Generated deploy JavaScript: `harper-app/resources.js` and
  `harper-app/web/**/*.js`
- Generated deploy JavaScript is ignored by git and must be produced
  with `bun run build`.

## PR merge handling

GitHub auto-merge cannot currently be enabled for this private repo
because the account does not have the required GitHub Pro/Team/Enterprise
feature. Attempts to enable it returned:

`Upgrade to GitHub Pro or make this repository public to enable this feature.`

When an agent opens a PR for this repo, merge the PR manually once it is
mergeable instead of relying on repository auto-merge.

## Documentation map

Docs here are operational, not aspirational. When reality changes, update
the matching doc in the same change.

| Doc | Captures |
|---|---|
| `README.md` | Top-level overview, repo layout, quick start, commands, seeded-data summary. |
| `docs/advisor-schema.md` | Conceptual entity model and field tables. |
| `docs/data-model-decisions.md` | Postgres-flavored DDL trade-offs: polymorphism, hierarchies, snapshots, provenance. |
| `docs/deploy-to-harper-fabric.md` | Harper Fabric deploy plan in theory. |
| `docs/fabric-runbook.md` | Harper Fabric deploy log for `advisory-rankings-dev`: topology, credentials, workarounds, failed alternatives. |
| `harper-app/README.md` | Notes for the deployed component root, config, schema, seed/verify entrypoints. |
| `docs/design-system.md` | AdvisorBook UI design system catalog: tokens, atoms, molecules, organisms, templates. |
| `docs/brokercheck-spike.md` | BrokerCheck parser/loader mapping and crawler operating notes. |
| `research/README.md` | How to repopulate `research/` from a non-blocked IP. |

## Project-specific doc triggers

- Editing `harper-app/schema.graphql` requires updates to
  `docs/advisor-schema.md` and, when deployment handling changes,
  `docs/fabric-runbook.md` section 6.
- Editing `harper-app/config.yaml` or the deploy branch's root
  `config.yaml` requires updates to the topology and deploy-branch layout
  sections of `docs/fabric-runbook.md`.
- Adding or removing a script under `src/scripts/` requires updates to
  the repo-layout block in `README.md` and the relevant runbook/data-path
  section.
- Editing BrokerCheck parsing, loading, fetching, or crawl orchestration
  under `src/lib/brokercheck*.ts` or `src/scripts/*brokercheck*.ts`
  requires updates to `docs/brokercheck-spike.md`.
- Rotating a credential or deploy-time setting requires updates to
  `docs/fabric-runbook.md` sections 1 and 9. Never put fresh secret
  values in tracked files.
- Provisioning a new Fabric resource requires adding the real ID or URL to
  the runbook inventory.
- Discovering that a documented step no longer matches reality requires
  fixing that doc in the same commit.

## UI specifics

The AdvisorBook web UI is built from the Atomic Design system under
`src/web/design-system/` and emitted to `harper-app/web/design-system/`.
Pages should import UI components from `src/web/design-system/index.ts`.

For visual verification, serve local generated web assets while proxying
data/resource requests to the deployed dev backend:

1. Run `bun run build`.
2. Serve `harper-app/web/` locally, for example:
   `python3 -m http.server 8765 --bind 127.0.0.1 --directory harper-app/web`.
3. In Playwright, fulfill static files from local disk and proxy `/Feed`,
   `/ArticleView/<id>`, `/AdvisorProfile/<id>`, `/FirmProfile/<id>`, `/Me`,
   and public-list/search resources to
   `https://advisory-rankings-de.cody-swann-org.harperfabric.com`.
4. Cover desktop and mobile when layout is touched. Use a real entity ID
   from `/Feed`, assert DOM behavior, and inspect a screenshot.

## Local verification

The expected local gate for normal changes is:

```bash
bun run build
bun run typecheck
bun run test
bun run test:cov
```

For deploy or UI-facing changes, also run the relevant smoke/deploy command:

```bash
bun run smoke
BASE_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com bun run smoke
```
