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
| `docs/design-system.md` | The AdvisorBook UI design system (Atomic Design — tokens / atoms / molecules / organisms / templates). The catalog of every UI component, where it lives, and how to extend it. Update on **every** UI change (new component, new variant, new token, removal). |
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

- **Touch any UI under `harper-app/web/`** → see "Working in the
  UI" below. The short version: never inline new markup if a
  component in `harper-app/web/design-system/` already does the
  job; never add a new component without also updating
  `docs/design-system.md`.

## Working in the UI (`harper-app/web/`)

The web UI is built as an Atomic Design system. The component
library lives in `harper-app/web/design-system/` and is documented
in `docs/design-system.md`. Every visual change — new card, new
row layout, new color, new form field — must go through that
library.

### Before changing anything visual

1. **Search the library first.** Open `docs/design-system.md`
   §4–§7 (atoms / molecules / organisms / templates) and the
   matching `design-system/*.js` file. If an existing component
   covers the use case (or a near-match plus a new variant
   would), use it — do not inline `el('div', { class: 'card' }, …)`
   or hand-roll a row with `.entity-list .row`.

2. **If no component fits, build one before the feature.**
   Pick the right tier (single-element variant → atom; small
   composition → molecule; section-level block → organism), add
   the `export function` to the corresponding file, add styles
   in `design-system/components.css` referencing `--ab-*` tokens
   (add new tokens to `tokens.css` first), and re-export it from
   `design-system/index.js`. Then consume it from the page.

3. **Update `docs/design-system.md` in the same change.** Add
   the new component to the catalog table for its tier, with a
   one-line "what it does." If you added or removed a token,
   update §3.

4. **Pages import only from `./design-system/index.js`.** They
   may also import non-UI utilities (`api`, `refreshMe`,
   `fmtMoney`, …) from `./app.js`. Do not import directly from
   `./design-system/molecules.js` or `./design-system/organisms.js`
   in a page file — go through the barrel.

5. **Never add raw hex colors or px sizes** in a stylesheet or
   `style=` attribute. Reference a `--ab-*` custom property. If
   the value isn't tokenized, add it to
   `design-system/tokens.css` first.

The legacy lower-case exports from `app.js` (`navbar`,
`siteFooter`, `mountPage`, `profileHead`, `sectionCard`,
`articleListBlock`, `transitionRow`, `disclosureRow`,
`entityChip`) are back-compat shims to the design-system
equivalents. New code must use the design-system names.

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
