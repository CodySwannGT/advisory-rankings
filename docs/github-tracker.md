# GitHub Tracker

This repo uses GitHub Issues as both the Lisa destination tracker and the
default PRD source.

`.lisa.config.json` is the source of truth:

```json
{
  "tracker": "github",
  "source": "github",
  "github": {
    "org": "CodySwannGT",
    "repo": "advisory-rankings"
  }
}
```

## Issue Lifecycles

Keep PRD labels and build labels separate. A PRD issue carries exactly one
`prd-*` label. A build ticket carries exactly one `status:*` label.

PRD lifecycle:

```text
prd-draft -> prd-ready -> prd-in-review -> prd-blocked | prd-ticketed -> prd-shipped
```

Build lifecycle:

```text
status:ready -> status:in-progress -> status:code-review -> status:on-dev -> status:done
```

Use `status:blocked` when an implementation issue cannot proceed.

## Templates

Use `.github/ISSUE_TEMPLATE/prd.yml` for product requirements. PRDs begin
with `prd-draft`; product moves them to `prd-ready` only after the body has
clear requirements, Gherkin acceptance criteria, and source artifacts.

Use `.github/ISSUE_TEMPLATE/work_item.yml` for implementation work. Work
items begin with `status:ready`, a `type:*` label, and a `priority:*` label.
Lisa-generated tickets should preserve the source PRD, artifact links, and
the validation journey.

## Label Setup

The tracked label catalog is `.github/labels.yml`. GitHub does not apply that
file automatically; use it as the canonical list when creating or auditing
labels with `gh label create` or `gh label edit`.

Required label namespaces:

- `prd-*` for PRD intake.
- `status:*` for build intake.
- `type:*` for issue type.
- `priority:*` for urgency.
- `component:*`, `points:*`, and `fix-version:*` may be added lazily when a
  ticket needs them.

## Lisa Intake

Run GitHub PRD intake against the configured repo:

```bash
/lisa:intake github intake_mode=prd
```

Run GitHub build intake against issues labeled `status:ready`:

```bash
/lisa:intake github intake_mode=build
```

In self-host mode, the source PRD issue and generated build tickets live in
the same repo. Do not put both `prd-*` and `status:*` labels on the same issue.
