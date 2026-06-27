# advisory-rankings

This repository is operated through its Lisa LLM Wiki.

- Start here: [wiki/start-here.md](wiki/start-here.md)
- Contract: [wiki/schema/llm-wiki-contract.md](wiki/schema/llm-wiki-contract.md)
- Preserved previous README: [wiki/documentation/root-readme.md](wiki/documentation/root-readme.md)
- Data coverage report: `bun run data:coverage` (add `-- --strict` to fail when recruiting-shaped articles have no extracted move)
- Data-depth baseline artifact: `bun run baseline:data-depth`
- Recruiting Market replay: `DATA_BASE_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com bun run verify:recruiting-market`
- Recruiting Deal Gaps replay: query
  `/RecruitingDealDataGaps?gapType=missing-deal-terms&limit=3`, then capture
  desktop/mobile evidence for `/recruiting/deal-gaps?gapType=missing-deal-terms&limit=3`.
- Major firm-source import artifacts: `bun run firm-source:major-imports`
- Bounded recruiting article backfill: `bun run backfill:recruiting-articles -- --limit 5`
- Advisor research queue: `bun run research:advisors -- due --max 5 --stale-days 30 --json`
- Research freshness workbench: `/research/freshness`, backed by
  `/AdvisorResearchQueue?sourceType=web_research&staleDays=30&limit=25`.
  The route keeps queue filters in the URL, exposes priority-group shortcuts,
  and renders compact advisor rows for deployed-data replay.
