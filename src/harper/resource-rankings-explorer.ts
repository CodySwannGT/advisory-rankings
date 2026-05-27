import { loadAll } from "./resource-data.js";
import {
  facets,
  filteredEntries,
  parseFilters,
  publicEntry,
  publicFilters,
  rankingsCoverage,
  sortEntries,
  summarize,
  topFirms,
} from "./resource-rankings-explorer-utils.js";
import {
  rankingEntries,
  type RankingExplorerEntry,
} from "./resource-rankings-explorer-entries.js";
import type { RouteTarget } from "../types/harper-resource.js";

export type { RankingExplorerEntry } from "./resource-rankings-explorer-entries.js";

/** Public rankings explorer resource. */
export class RankingsExplorer extends Resource {
  /**
   * Allows anonymous readers to inspect source-backed ranking rows.
   * @returns True because rankings explorer data is public.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Loads ranking categories, filters, aggregate summaries, and rows.
   * @param target - Optional route target carrying category, year, firm, state, city, resolved, sort, and limit filters.
   * @returns Source-backed rankings explorer payload.
   */
  async get(target?: RouteTarget): Promise<Readonly<Record<string, unknown>>> {
    const db = await loadAll();
    const filters = parseFilters(target, db);
    const allEntries = rankingEntries(db);
    const entries: readonly RankingExplorerEntry[] = filteredEntries(
      allEntries,
      filters
    );
    const sorted: readonly RankingExplorerEntry[] = sortEntries(
      entries,
      filters.sort
    ).slice(0, filters.limit);
    return {
      generatedAt: new Date().toISOString(),
      filters: publicFilters(filters),
      facets: facets(allEntries),
      summary: summarize(entries),
      coverage: rankingsCoverage(entries),
      topFirms: topFirms(entries),
      items: sorted.map(publicEntry),
      provenance: {
        sourceTables: ["Ranking", "RankingEntry", "FirmAlias"],
        sourceIds: sorted.map(entry => entry.id),
      },
      emptyState:
        entries.length === 0
          ? "No matching public ranking rows are loaded for these filters."
          : null,
    };
  }
}
