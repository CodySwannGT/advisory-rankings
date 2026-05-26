---
type: requirement
created: 2026-05-25
updated: 2026-05-25
related:
  - ../entities/advisor-domain-model.md
  - ../architecture/project-architecture.md
  - ../architecture/web-ui-design-system.md
sources:
  - ../sources/documentation/2026-05-25-advisorbook-personas.md
sensitivity: internal
---

# AdvisorBook personas

AdvisorBook currently centers on public advisor intelligence: source-backed articles, advisor and
firm profiles, team context, rankings, recruiting moves, regulatory events, search, and read-only MCP
access. The personas below are derived from the current app and docs, plus the user-provided seed
personas. Source: wiki/sources/documentation/2026-05-25-advisorbook-personas.md.

## Persona map

| Persona | Evidence strength | Core job | Primary app surfaces | Trust requirements |
|---|---|---|---|---|
| Recruiter / Recruiting Intelligence Lead | Strong | Find teams and advisors in motion, track firm momentum, compare markets, and spot incomplete deal data. | Recruiting Market Map, feed transition cards, firm profiles, global search. | Source-backed move rows, visible AUM/T12 gaps, firm alias resolution, current/past advisor rosters. |
| Financial Advisor / Team Principal | Medium | Monitor public reputation, profile accuracy, team context, rankings, and competitive positioning. | Advisor profile, team profile, rankings explorer, firm profile, search. | Clear provenance, BrokerCheck attribution, ranking context, and a future correction or claim path if self-service becomes in scope. |
| Individual Investor / Client Due-Diligence Researcher | Medium | Evaluate whether an advisor or firm is credible, active, and free of concerning regulatory patterns. | Advisor profile, firm profile, regulatory/compliance events, search, rankings, public directories. | Plain-language disclosures, career history, firm affiliations, BrokerCheck freshness, and comparison/list workflows. |
| Wealth Management Journalist / Research Desk | Strong | Find story leads, adverse history, ranking anomalies, recruiting moves, and source-backed facts to verify. | Feed, article detail, advisor/firm/team profiles, regulatory page, recruiting, rankings, search, MCP. | Field-level provenance, source URLs, loaded dates, unresolved-entity flags, and ability to trace facts back to articles or BrokerCheck. |
| Wealthtech VC / Angel Investor | Medium-low | Assess whether the app has a defensible data/product opportunity worth funding. | Feed, rankings, recruiting, public MCP, profile depth, source transparency, live deployed app. | Coverage metrics, data freshness, source rights, usage/retention, monetization path, and proof that public read-only access can become a durable distribution surface. |

## Recruiter / Recruiting Intelligence Lead

This persona works in wealth-management recruiting, business development, or competitive intelligence.
They care about who is moving, from where, to where, with how much AUM, which markets are heating up,
and which firms are gaining or losing momentum.

Current fit:

- `/RecruitingMarket` groups public team move activity by firm, market, source status, and known AUM.
- Recent move rows expose subject, from-firm, to-firm, move date, AUM moved, T12 production,
  headcount, location, source article, and missing-field status.
- Firm profiles and feed transition cards give context around recent moves and related articles.

Product implications:

- Recruiter workflows should make data gaps visible rather than hiding them.
- Filters should stay URL-driven and shareable by firm, state, year, and direction.
- Future PRDs for this persona should verify a real recruiting question end to end, such as "which
  firms gained known AUM in New York this year?"

## Financial Advisor / Team Principal

This persona is a financial advisor, team lead, or practice principal who wants to understand how
they, their team, their firm, and nearby competitors appear in public intelligence.

Current fit:

- Advisor profiles expose career status, current or recent employment, teams, disclosures,
  sanctions, transitions, articles, and coverage.
- Team profiles expose current and past members, team metric snapshots, transitions, and articles.
- Rankings explorer shows resolved and unresolved ranking rows with firm and market context.

Product implications:

- Treat this as a reputation and competitive-context persona unless the roadmap explicitly adds
  advisor self-service.
- A claim/correction workflow, if introduced, must preserve source-backed facts rather than replacing
  provenance with user-entered claims.
- Future PRDs should distinguish "view my public profile" from "manage data", because the login copy
  currently says public browsing works without sign-in while sign-in is for managing data.

## Individual Investor / Client Due-Diligence Researcher

This persona is a prospective client comparing advisors or firms before making contact. They need
plain-language signals that reduce trust risk: career history, licenses/identifiers, regulatory
events, firm context, rankings, articles, and public contact/profile data.

Current fit:

- Public advisor and firm pages expose career status, firm affiliations, BrokerCheck-derived context,
  disclosures, and related articles.
- Global search and public directories support lookup by advisor, firm, and team.
- The conceptual product layer already separates user ratings and lists from source-backed ground
  truth.

Product implications:

- The investor workflow should translate regulatory and provenance details without weakening the
  underlying facts.
- Comparison and saved-list features should remain clearly separate from source-backed assertions.
- Future PRDs should verify an investor-style journey against a real advisor, including a disclosure
  or "no disclosure found" state.

## Wealth Management Journalist / Research Desk

This persona looks for story leads, adverse history, ranking anomalies, recruiting trends, and
evidence trails. The user's phrase "looking for dirt" maps to a legitimate investigative workflow:
surface concerning facts, preserve source context, and make uncertainty explicit.

Current fit:

- Article detail pages preserve full article context, event blocks, mentioned entities, and
  field-assertion provenance.
- Feed cards, compliance events, rankings, recruiting, and search expose lead-generation surfaces.
- MCP tools can provide read-only structured access to search, feed, profile, and article data.

Product implications:

- Every surfaced lead should show whether it is source-backed, unresolved, stale, or missing data.
- Journalistic workflows need source URLs, loaded dates, article/provenance references, and entity
  disambiguation.
- Future PRDs should verify a reporter journey from search to profile to article provenance.

## Wealthtech VC / Angel Investor

This persona evaluates whether AdvisorBook is investable. They are less likely to be a daily product
operator and more likely to inspect the live product, public data depth, source quality, technical
distribution, and growth potential.

Current fit:

- The app demonstrates public advisor intelligence across feed, profiles, rankings, recruiting,
  compliance, search, and read-only MCP.
- Source transparency, unresolved states, and provenance help show data quality discipline.
- The deployed public endpoint lets investors inspect the product without credentials.

Product implications:

- Investor-facing product work should expose coverage, freshness, source mix, and usage proof, not
  only richer profile pages.
- VC/angel diligence needs metrics that are not fully represented in current app surfaces: activation,
  retention, acquisition channels, revenue model, source rights, and data refresh costs.
- Future PRDs for this persona should be framed as an investor diligence dashboard or data-room
  surface, not as a normal end-user workflow.

## Open questions

- Which persona is the primary near-term buyer or operator: recruiter, journalist/research desk,
  advisor, individual investor, or investor evaluator?
- Is advisor self-service intended, or should advisors remain only public-profile subjects?
- Are individual investor ratings/lists a near-term shipped workflow or only a conceptual product
  layer for later?
- Should investor-facing evidence live inside the app, in a private data room, or as generated
  operating metrics from the Harper/Fabric deployment?
- What minimum source freshness and coverage thresholds make each persona's workflow trustworthy?
