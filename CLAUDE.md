# Working in this repo

## Always keep the documentation in sync with reality

This project's docs are operational, not aspirational — other agents
and humans rely on them to know what was done, what's broken, and
what's intentionally weird. **Whenever you change something this
project documents, update the matching doc in the same change.**
"I'll update the doc later" is how the runbook starts lying.

### What lives where

| Doc | Captures |
|---|---|
| `README.md` | Top-level overview + quick start. Update when commands, the layout, or seeded-data summary change. |
| `docs/advisor-schema.md` | Conceptual entity model. Update when adding/renaming/dropping entities or fields. |
| `docs/data-model-decisions.md` | Postgres-flavored DDL trade-offs (polymorphism, hierarchies, snapshots, provenance). Update when a modeling rule changes. |
| `docs/deploy-to-harper-fabric.md` | The Harper Fabric deploy *plan* (theory). Update only if the planned flow itself changes. |
| `docs/fabric-runbook.md` | The Harper Fabric deploy *log* — what actually happened on `advisory-rankings-dev`, every workaround, every failed alternative. Update on **every** ops change: deploys, schema reloads, credential rotations, topology shifts, new scripts, new known-broken paths. |
| `harper-app/README.md` | The deployed component's local notes. Update when `config.yaml`, the schema, or the seed/verify entrypoints change shape. |
| `research/README.md` | How to repopulate `research/` from a non-blocked IP. Update when crawler scripts or the source URLs change. |

### Concrete triggers — if you do X, update Y

- **Edit `harper-app/schema.graphql`** → update `docs/advisor-schema.md`
  (entity tables) and the §6 "Updating the deployed app" section of
  `docs/fabric-runbook.md` if the change requires special handling
  (renames, type narrowing, etc.). Also re-check that
  `scripts/verify_via_rest.py` still resolves the joins it spot-checks.

- **Edit `harper-app/config.yaml` or the deploy branch's root `config.yaml`**
  → update §2 (topology) and §3 (`fabric-deploy` branch layout) of the
  runbook.

- **Add/remove a script under `scripts/`** → mention it in the
  relevant runbook section (most likely §7 if it's a data path) and
  in the repo-layout block in `README.md`.

- **Hit a new Fabric / Harper limitation and find a workaround** →
  document it in `docs/fabric-runbook.md` under whichever section it
  fits, in the same shape as the existing entries (symptom → root
  cause → fix → known-broken alternatives). The "what we tried first
  that did not work" notes are not optional — they save the next
  person from repeating the failure.

- **Rotate a credential or change a deploy-time setting** → update
  §1 (inventory) and §9 (rotation) of the runbook. Do not put fresh
  secret values in any tracked file; `~/.harper-fabric-credentials`
  is the source of truth.

- **Provision a new resource (cluster, org, deploy key, custom domain,
  …)** → add it to §1 of the runbook with its real ID/URL.

- **Discover that a documented step no longer matches reality** →
  fix the doc in the same commit, even if you didn't cause the drift.
  Note the correction in the commit message.

### Style conventions for these docs

- Show real values (cluster IDs, FQDNs, exact commands) — they're
  more useful than placeholders for a single-deployment project.
- When you describe a workaround, lead with the symptom (what error
  message or behavior the next person will see), then root cause,
  then fix. Generic "best practice" without a triggering symptom
  rots fast.
- If a path is broken-but-tempting, document the failure mode so
  the next agent doesn't waste a session on it. Examples already in
  the runbook: the GitHub Actions workflow that tried to add the
  deploy key (see fabric-runbook §4), and the npm-handles-subdir
  hope (see §3).
- Prefer concrete tables over prose for inventory-style content.
  Reserve prose for narrative — what we tried, in what order, and
  why we stopped.
- Don't add emojis or marketing copy.
