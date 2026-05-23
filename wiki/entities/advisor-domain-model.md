---
type: entity
created: 2026-05-23
updated: 2026-05-23
related:
  - ../decisions/data-model-decisions.md
  - ../playbooks/brokercheck-operations.md
sources:
  - ../sources/documentation/2026-05-23-initial-project-docs.md
---

# Advisor domain model

The advisor data model centers on public advisor intelligence sourced from AdvisorHub-style stories,
BrokerCheck-style regulatory records, seeded canonical data, and product-layer user interactions.
Source: wiki/sources/documentation/2026-05-23-initial-project-docs.md.

## Core entities

- `Advisor` captures identity, career status, public profile, FINRA/SEC identifiers, and public
  contact/profile attributes.
- `Firm`, `FirmAlias`, and `FirmMergeAudit` model firm identity, alias canonicalization, and merge
  provenance.
- `Branch` and `BranchAssignment` model market, complex, and branch hierarchy plus leadership roles.
- `Team`, `TeamMembership`, and `TeamMetricSnapshot` model advisor teams and their metric history.
- `TransitionEvent`, `Ranking`, `RankingEntry`, and `Article` preserve the story and ranking layer.
- `Disclosure`, `Sanction`, `OutsideBusinessActivity`, and `BrokerCheckSnapshot` preserve regulatory
  and BrokerCheck-derived facts.
- `AdvisorResearchCheck` tracks scheduled public-web research for missing or stale advisor data.

## Product layer

The product layer adds user ratings and lists on top of the public advisor data model. These are
separate from the provenance-bearing source entities so product interactions do not erase the source
trail.

## Provenance principle

Facts should retain their source path, confidence, and update history. BrokerCheck, AdvisorHub, and
web-research records can disagree, so reconciliation belongs in explicit pages, decisions, or open
questions rather than silent overwrites. Source:
wiki/sources/documentation/2026-05-23-initial-project-docs.md.
