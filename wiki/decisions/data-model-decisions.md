---
type: decision
created: 2026-05-23
updated: 2026-05-23
related:
  - ../entities/advisor-domain-model.md
sources:
  - ../sources/documentation/2026-05-23-initial-project-docs.md
---

# Data model decisions

## Decision

The project keeps a provenance-heavy advisor model that accepts Harper's operational constraints
while documenting the richer relational invariants that would exist in a Postgres-flavored design.
Source: wiki/sources/documentation/2026-05-23-initial-project-docs.md.

## Rationale

Harper does not enforce every relational guarantee described in the conceptual model, so constraints
such as foreign keys, polymorphic-subject exclusivity, uniqueness of current records, and some
validity windows move into application logic and verification scripts. The schema and docs preserve
the intended invariants so code paths can enforce them deliberately.

## Key choices

- Polymorphic subjects such as transition events and ranking entries use nullable scalar IDs with
  code-level checks for exactly one subject.
- Branches use a hierarchy that can represent market, complex, and branch levels.
- Firm self-references and alias records support canonicalization and historical mergers.
- Metric snapshots are kept as append-only history; current metrics are derived at read time.
- Mention and provenance layers remain separate so facts can cite their source material.

## Consequences

Tests and smoke checks must guard invariants that the database will not enforce. Data loading,
canonicalization, and merge scripts are part of the integrity boundary, not just convenience tooling.
Source: wiki/sources/documentation/2026-05-23-initial-project-docs.md.
