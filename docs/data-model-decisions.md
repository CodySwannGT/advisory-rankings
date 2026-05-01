# Data Model Decisions

Resolutions for the open architectural questions flagged in
`advisor-schema.md`. Targets PostgreSQL. Each section: the problem, the
decision, the rationale, and DDL.

Status: proposed (not yet implemented).

---

## 1. Polymorphic subjects (`TransitionEvent`, `RankingEntry`, `Mention`)

**Problem.** A `TransitionEvent` subject can be an `Advisor`, `Team`, or
sometimes a `Firm`. Same for `RankingEntry`. `Mention` references every
entity in the system (advisor, firm, team, branch, transition event,
disclosure, …).

**Decision.** Pick differently per use case — polymorphism isn't one
decision.

### 1a. `TransitionEvent` and `RankingEntry`: 3 nullable FKs + CHECK

Set is small (Advisor / Team / Firm) and stable. Use real FKs.

```sql
CREATE TABLE transition_events (
  id              bigserial PRIMARY KEY,
  advisor_id      bigint REFERENCES advisors(id),
  team_id         bigint REFERENCES teams(id),
  firm_id         bigint REFERENCES firms(id),
  -- ...
  CHECK (num_nonnulls(advisor_id, team_id, firm_id) = 1)
);
CREATE INDEX ON transition_events (advisor_id) WHERE advisor_id IS NOT NULL;
CREATE INDEX ON transition_events (team_id)    WHERE team_id    IS NOT NULL;
CREATE INDEX ON transition_events (firm_id)    WHERE firm_id    IS NOT NULL;
```

### 1b. `Mention`: split into per-target tables

Mention has 7+ target types and will grow. Per-target tables give clean
indexes, real FKs, and the queries you actually run hit a single table
without `WHERE type = 'X'` filtering.

```sql
CREATE TABLE article_advisor_mentions (
  article_id  bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  advisor_id  bigint NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, advisor_id)
);
-- Same shape for: firm, team, branch, transition_event, disclosure
```

**Why not Rails-style polymorphic (`subject_type` + `subject_id`)?**
Loses FK constraints at the DB level and forces a partial index per type
to keep queries fast. Acceptable in Rails apps that don't enforce
referential integrity in the DB; not what I'd ship for a system of
record.

---

## 2. Branch hierarchy (market → complex → branch)

**Problem.** Wirehouses have a 3-level branch hierarchy. Smaller firms
have only branches. We need a single table.

**Decision.** Adjacency list + a `level` enum + a CHECK that
`parent.level = self.level - 1`. Depth is fixed at 3, so closure tables
or `ltree` are overkill.

```sql
CREATE TYPE branch_level AS ENUM ('market', 'complex', 'branch');

CREATE TABLE branches (
  id               bigserial PRIMARY KEY,
  firm_id          bigint NOT NULL REFERENCES firms(id),
  parent_branch_id bigint REFERENCES branches(id),
  level            branch_level NOT NULL,
  -- name, building_name, address, city, state, ...
);

CREATE INDEX ON branches (firm_id, level);
CREATE INDEX ON branches (parent_branch_id) WHERE parent_branch_id IS NOT NULL;

CREATE FUNCTION check_branch_parent_level() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_branch_id IS NULL THEN
    IF NEW.level <> 'market' THEN
      RAISE EXCEPTION 'only markets can have NULL parent';
    END IF;
  ELSE
    PERFORM 1 FROM branches p
    WHERE p.id = NEW.parent_branch_id
      AND ((NEW.level = 'complex' AND p.level = 'market')
        OR (NEW.level = 'branch'  AND p.level = 'complex'));
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid parent level for %', NEW.level;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_branch_parent_level
  BEFORE INSERT OR UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION check_branch_parent_level();
```

---

## 3. Firm self-references

**Problem.** A `Firm` has two distinct relationships to other firms:

- **`parent_firm`** = current ownership (Merrill ⊂ BoA)
- **`successor_firm`** = historical lineage (Smith Barney → Morgan Stanley)

These are different in nature: one is a snapshot, the other is a
temporal event with attributes (date, reason, partial vs. full).

**Decision.**

- Keep `parent_firm_id` as a column on `firms` (current-state snapshot).
- Extract succession to its own table — successions have **dates,
  reasons, and partial transfers** (Lehman → Barclays for the US
  business, → Nomura for Asia/EU). A scalar can't model that.

```sql
CREATE TYPE succession_type AS ENUM
  ('acquired', 'merged', 'seized', 'spun_off', 'wound_down', 'rebranded');

CREATE TABLE firm_successions (
  id                       bigserial PRIMARY KEY,
  predecessor_firm_id      bigint NOT NULL REFERENCES firms(id),
  successor_firm_id        bigint NOT NULL REFERENCES firms(id),
  succession_date          date   NOT NULL,
  succession_type          succession_type NOT NULL,
  transferred_assets_pct   numeric(5,2),  -- partial successions
  transferred_advisors_pct numeric(5,2),
  notes                    text,
  UNIQUE (predecessor_firm_id, successor_firm_id, succession_date)
);
CREATE INDEX ON firm_successions (predecessor_firm_id);
CREATE INDEX ON firm_successions (successor_firm_id);
```

"Trace this advisor's career through firm name changes" becomes a
recursive CTE walking `firm_successions`, instead of a brittle column.

---

## 4. Three advisor roles per branch

**Problem.** Branch manager, complex executive, and market leader appear
by name in moves articles. Managers change. Denormalizing them onto
`branches` loses the history.

**Decision.** `branch_assignments` table with bitemporal validity. One
*current* holder per (branch, role) enforced by a partial unique index.

```sql
CREATE TYPE branch_role AS ENUM
  ('branch_manager', 'complex_executive', 'market_leader');

CREATE TABLE branch_assignments (
  id              bigserial PRIMARY KEY,
  branch_id       bigint NOT NULL REFERENCES branches(id),
  advisor_id      bigint NOT NULL REFERENCES advisors(id),
  role            branch_role NOT NULL,
  effective_from  date NOT NULL,
  effective_to    date,    -- NULL = current
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- One current holder per (branch, role):
CREATE UNIQUE INDEX branch_assignments_current_uniq
  ON branch_assignments (branch_id, role)
  WHERE effective_to IS NULL;

CREATE INDEX ON branch_assignments (branch_id, role, effective_to);
CREATE INDEX ON branch_assignments (advisor_id, effective_to);
```

If "show current manager" becomes a hot lookup, add a materialized view
(`branch_current_assignments`) refreshed nightly. Don't pre-optimise.

---

## 5. Disclosure clusters

**Problem.** One scandal → multiple parallel `Disclosure` rows
(FINRA AWC + state action + arbitration award + customer dispute + U5
termination). The earlier draft used a `cross_disclosure_ids[]` array,
which loses FK integrity and makes group queries awkward.

**Decision.** Group via a `disclosure_clusters` table; each related
event points to the same cluster. Standalone events leave `cluster_id`
NULL.

```sql
CREATE TABLE disclosure_clusters (
  id                     bigserial PRIMARY KEY,
  root_event_description text NOT NULL,
  primary_disclosure_id  bigint REFERENCES disclosures(id),
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE disclosures
  ADD COLUMN cluster_id bigint REFERENCES disclosure_clusters(id);
CREATE INDEX ON disclosures (cluster_id) WHERE cluster_id IS NOT NULL;
```

A single advisor's BrokerCheck-style view:

```sql
SELECT *
FROM disclosures
WHERE advisor_id = $1
ORDER BY cluster_id NULLS FIRST, date_initiated;
```

---

## 6. Metric snapshots vs. denormalized "latest" columns

**Problem.** `Team.aum` and `Team.annual_revenue` drift the moment you
backfill or correct an article.

**Decision.** Snapshots-only. Expose "current" as a database VIEW. The
`teams` row carries no metric columns at all.

```sql
CREATE TABLE team_metric_snapshots (
  id              bigserial PRIMARY KEY,
  team_id         bigint NOT NULL REFERENCES teams(id),
  as_of           date NOT NULL,
  aum             numeric(18,2),
  annual_revenue  numeric(14,2),
  household_count integer,
  team_size       integer,
  source_type     text NOT NULL,
  source_ref      text,
  UNIQUE (team_id, as_of, source_type)
);
CREATE INDEX ON team_metric_snapshots (team_id, as_of DESC);

CREATE VIEW team_current_metrics AS
SELECT DISTINCT ON (team_id) *
FROM team_metric_snapshots
ORDER BY team_id, as_of DESC;
```

If `team_current_metrics` becomes read-hot:

```sql
-- Promote to a materialized view, refreshed on insert via trigger or batch:
CREATE MATERIALIZED VIEW team_current_metrics_mv AS
SELECT DISTINCT ON (team_id) *
FROM team_metric_snapshots
ORDER BY team_id, as_of DESC;
CREATE UNIQUE INDEX ON team_current_metrics_mv (team_id);
```

Same pattern for `advisor_metric_snapshots`.

---

## 7. Mention + provenance — split into two layers

**Problem.** v0.2 conflated "this article references this entity" with
"this article asserted this specific fact." They are different.

**Decision.** Two layers.

- **`article_*_mentions`**: per-target mention tables (see §1b) — the
  article-to-entity index. Used for navigation and search.
- **`field_assertions`**: append-only log of every individual fact
  asserted, with quote and confidence. The provenance backbone.

```sql
-- Mentions: see §1b
-- (article_advisor_mentions, article_firm_mentions, article_team_mentions, …)

-- The provenance log: one row per asserted fact
CREATE TYPE assertion_confidence AS ENUM
  ('asserted', 'inferred', 'derived');

CREATE TABLE field_assertions (
  id              bigserial PRIMARY KEY,
  article_id      bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  target_table    text   NOT NULL
    CHECK (target_table IN
      ('advisors','teams','firms','branches',
       'transition_events','disclosures','sanctions',
       'employment_histories','team_memberships',
       'outside_business_activities','registration_applications')),
  target_id       bigint NOT NULL,
  field_name      text   NOT NULL,
  asserted_value  jsonb  NOT NULL,
  quote_phrase    text   NOT NULL,
  confidence      assertion_confidence NOT NULL DEFAULT 'asserted',
  asserted_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON field_assertions
  (target_table, target_id, field_name, asserted_at DESC);
CREATE INDEX ON field_assertions (article_id);
```

`target_table` is a text discriminator, not a real FK — provenance logs
are append-only and the value is opaque to the FK system. The CHECK
constraint restricts it to the known table set.

**What this enables:**

- **"Where did this fact come from?"** — single lookup on
  `(target_table, target_id, field_name)`.
- **Drift detection** — group by `(target_table, target_id, field_name)`
  and compare the most recent assertions; surface conflicts.
- **History reconstruction** — the assertion log is the source of truth
  for time-travel queries.
- **LLM reconciler** — the model rereads quotes when an assertion
  conflicts with another, and proposes a canonical value.

---

## Summary of structural changes vs. v0.2

| v0.2 | v0.3 (this doc) |
|---|---|
| `subject_type` + `subject_id` polymorphic columns | 3 nullable FKs + CHECK (TransitionEvent, RankingEntry); per-target tables (Mention) |
| `Branch.parent_branch_id` only | + `branch_level` enum + parent-level trigger |
| `Firm.successor_firm_id` scalar | `firm_successions` table with dates, type, partial-transfer pcts |
| `Branch.{branch_manager,complex_exec,market_leader}_advisor_id` | `branch_assignments` table, bitemporal |
| `Disclosure.cross_disclosure_ids[]` | `disclosure_clusters` table |
| `Team.aum`, `Team.annual_revenue`, `Team.household_count`, `Team.team_size` | Removed from `teams`; lives only in `team_metric_snapshots` + `team_current_metrics` view |
| `source_facts` JSONB column on every entity | Dedicated `field_assertions` table + per-target mention tables |

## Implementation order (when you're ready)

1. **Foundations**: `firms`, `firm_successions`, `branches` (with trigger), `advisors`.
2. **Career model**: `employment_histories`, `teams`, `team_memberships`, `branch_assignments`.
3. **Events**: `transition_events`, `recruiting_deal_quotes`.
4. **Compliance**: `disclosures`, `sanctions`, `disclosure_clusters`, `outside_business_activities`, `registration_applications`.
5. **Metrics**: `team_metric_snapshots`, `advisor_metric_snapshots` + views.
6. **Rankings**: `rankings`, `ranking_entries`.
7. **Provenance**: `articles`, `article_*_mentions`, `field_assertions`.
8. **User layer**: `user_ratings`, `user_lists`, `user_list_entries`.

Provenance comes near the end intentionally — its schema depends on the
full set of `target_table` values being settled.
