# BrokerCheck spike fixtures

Captured 2026-05-02 against `api.brokercheck.finra.org` (the
undocumented JSON endpoint that backs the BrokerCheck SPA). Used as
the evidence base for `docs/brokercheck-spike.md`.

| File | Endpoint | Subject |
|---|---|---|
| `cairnes-search.json` | `GET /search/individual?query=George+J+Cairnes&...` | Single-hit search, returns CRD `4068906`. |
| `cairnes-detail.json` | `GET /search/individual/4068906?wt=json` | Full individual report — 5 employments, 6 disclosures, 4 exams. Disclosure-rich case. |
| `cronk-detail.json` | `GET /search/individual/2498892?wt=json` | Wells Fargo CIO Darrell Cronk — 1 current + 4 previous employments, **0 disclosures**, 5 exams. Clean-record case. |
| `wf-firm-search.json` | `GET /search/firm?query=Wells+Fargo+Clearing&...` | Firm search; resolves to `firmId=19616`. |
| `wf-firm-detail.json` | `GET /search/firm/19616?wt=json` | Full firm report — 184 regulatory + 2 civil + 303 arbitration disclosures, 53 state registrations, 7,782 branches, 10 named directOwners w/ CRDs, 9 historical corporate names. |

Replay (one-off, polite — see ToU section in
`docs/brokercheck-spike.md` before doing anything at scale):

```bash
curl -s -A "advisory-rankings-research-spike" \
  "https://api.brokercheck.finra.org/search/individual/4068906?wt=json" \
  > research/brokercheck-samples/cairnes-detail.json
```

Inside each `_source.content` value is a JSON-encoded string; decode
twice to read it.
