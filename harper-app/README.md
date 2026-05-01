# Harper application

The advisor schema running on Harper (formerly HarperDB).

## Files

| File | Purpose |
|---|---|
| `config.yaml` | Component config — declares this dir as a Harper application, points at `*.graphql` for schema, enables REST. |
| `schema.graphql` | 34 entity types (`@table @export`) translated from `docs/advisor-schema.md`. PKs, indexes, timestamp directives. |
| `seed.py` | Loads sample data from the two scraped articles (`research/articles/`) — 99 records across 23 tables. |
| `verify.py` | Cross-table SQL queries that exercise the relationships (career walks, disclosure clusters, sanction stacks, provenance log). |

## How to run (clean machine)

```bash
npm install --save harperdb
HDB_ROOT=$HOME/.harperdb \
TC_AGREEMENT=yes \
HDB_ADMIN_USERNAME=admin HDB_ADMIN_PASSWORD=admin-local \
  ./node_modules/.bin/harperdb install

ln -sfn "$PWD/harper-app" "$HOME/.harperdb/components/advisor-app"
./node_modules/.bin/harperdb start

# Talk to the operations API on port 9925:
curl -u admin:admin-local -H 'Content-Type: application/json' \
  -d '{"operation":"describe_all"}' http://127.0.0.1:9925/

python3 harper-app/seed.py
python3 harper-app/verify.py
```

Once the server is up, REST endpoints are auto-generated for every
`@export`-ed type at `http://127.0.0.1:9926/<TableName>` (port 9926 by
default).

## Sandbox / container caveat

Harper uses [`node-unix-socket`](https://www.npmjs.com/package/node-unix-socket)
for `SO_REUSEPORT`-based load balancing across worker threads. Some
container kernels (this one included) reject those socket options with
`EAFNOSUPPORT`, which surfaces as `"Unable to bind to port 9925"`.

Workaround applied here:

1. **`threads.count: 1`** in `~/.harperdb/harperdb-config.yaml` — drops
   the multi-thread reuseport requirement.
2. Disabled the MQTT listeners (1883 / 8883) for the same reason — we
   don't use MQTT.
3. Talk to the operations API via the **Unix domain socket** Harper
   creates at `/home/user/.harperdb/operations-server`. It exposes the
   same JSON API as port 9925; `seed.py` and `verify.py` use
   `curl --unix-socket` for this.

On a normal host or VM the TCP ports work fine and the workaround is
unnecessary.

## What the verification confirms

- All 34 tables from the schema were created with correct PK + attribute
  shape (run `describe_all`).
- A four-firm career walk for C. James Taylor reconstructs from
  `EmploymentHistory` joined to `Firm`, ordered by start date.
- The `TeamMetricSnapshot` table holds two AUM points for the Taylor
  Group (2023 Barron's profile = $1.2B, 2026 AdvisorHub = $5.94B) — the
  snapshots-only metric model in action.
- The Wells Fargo `RecruitingDealQuote` (275% T-12 upfront) joins
  cleanly to the `TransitionEvent`.
- The Cairnes disclosure cluster reconstructs all five parallel events
  (FINRA AWC + Texas state board + arbitration award + customer dispute
  + U5 employment separation) via `cluster_id`.
- Three `Sanction` rows stack on the FINRA AWC (fine + suspension + TX
  bar).
- The `FieldAssertion` provenance log exposes the literal quote that
  asserted each fact, joined back to the source `Article`.
