/**
 * Index-backed advisor name token queries.
 *
 * These helpers translate a user-supplied free-text `q` into a bounded
 * `advisorId` set by issuing one `starts_with` query per token against
 * the `AdvisorSearchIndex.token` secondary index (per spike §0.1 Q2 a
 * btree range scan), then intersecting per-token id sets. The hot path
 * NEVER enumerates the Advisor table itself — that is the whole point
 * of #721.
 *
 * The intersection is capped at {@link TOKEN_INTERSECTION_CAP} so a
 * pathological one-letter prefix (e.g. `"a"`, were we not also enforcing
 * the >=2 length floor in `splitQueryTokens`) cannot fan out into an
 * unbounded hydration pass. When the cap trips the caller surfaces
 * `truncated: true` so the response can signal "+more".
 */
import {
  splitQueryTokens,
  normalizeQueryToken,
} from "../lib/advisor-tokens.js";
import type { AdvisorSearchIndexRow } from "../lib/advisor-search-index.js";

/** Hard ceiling on the intersected advisor-id set per /PublicAdvisors q query. */
export const TOKEN_INTERSECTION_CAP = 500;

/** Result of {@link searchAdvisorsByTokens}. */
export interface TokenQueryResult {
  /** Distinct advisor ids matching every query token, in stable order. */
  readonly ids: readonly string[];
  /** True when the intersection hit {@link TOKEN_INTERSECTION_CAP}. */
  readonly truncated: boolean;
}

/** Minimal `tables.AdvisorSearchIndex` surface this module reaches for. */
interface SearchableTokenTable {
  readonly search: (
    query: Readonly<Record<string, unknown>>
  ) => AsyncIterable<AdvisorSearchIndexRow>;
}

const intersect = (
  a: ReadonlySet<string>,
  b: ReadonlySet<string>
): ReadonlySet<string> => {
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  return new Set([...smaller].filter(id => larger.has(id)));
};

const tokenIdsFor = async (
  table: unknown,
  token: string
): Promise<ReadonlySet<string>> => {
  // `starts_with` on an @indexed String is a Harper btree range scan
  // (spike §0.1 Q2). `select` is not used: spike Q3 showed projection
  // happens post-hydration, so dropping `select` saves nothing and
  // simplifies the row shape downstream.
  const searchable = table as SearchableTokenTable;
  const rows = await Array.fromAsync(
    searchable.search({
      conditions: [
        { attribute: "token", comparator: "starts_with", value: token },
      ],
    })
  );
  return new Set(rows.map(row => row.advisorId));
};

/**
 * Pure-logic intersection step factored out for unit testing. Given the
 * per-token candidate id sets in query order, returns the intersected
 * set capped at {@link TOKEN_INTERSECTION_CAP} along with whether the
 * cap was reached. Stable iteration order matches the first token's
 * insertion order (a `Set` preserves insertion), so the caller's
 * subsequent in-memory sort is deterministic.
 * @param idSets - Per-token candidate advisor-id sets, in query order.
 * @returns Capped intersected advisor ids plus truncation flag.
 */
export function intersectTokenIdSets(
  idSets: readonly ReadonlySet<string>[]
): TokenQueryResult {
  if (idSets.length === 0) return { ids: [], truncated: false };
  const merged = idSets
    .slice(1)
    .reduce<
      ReadonlySet<string>
    >((acc, next) => intersect(acc, next), idSets[0]);
  const all = [...merged];
  const truncated = all.length > TOKEN_INTERSECTION_CAP;
  return {
    ids: truncated ? all.slice(0, TOKEN_INTERSECTION_CAP) : all,
    truncated,
  };
}

/**
 * Resolves `q` to a bounded advisor-id set via the AdvisorSearchIndex
 * token table. Returns an empty result for queries that tokenize to
 * nothing (single-character, whitespace-only, punctuation-only) so the
 * caller can treat "no tokens" identically to "no q" — matching the
 * existing `/Search` `< 2` guard the legacy code already enforced.
 * @param table - Harper `tables.AdvisorSearchIndex` handle.
 * @param q - Raw user-supplied query string.
 * @returns Intersected advisor ids plus truncation flag.
 */
export async function searchAdvisorsByTokens(
  table: unknown,
  q: string
): Promise<TokenQueryResult> {
  const tokens = splitQueryTokens(q);
  if (tokens.length === 0) return { ids: [], truncated: false };
  const perToken = await Promise.all(
    tokens.map(token => tokenIdsFor(table, token))
  );
  return intersectTokenIdSets(perToken);
}

/**
 * Convenience wrapper for callers that already have a normalized token
 * (single-word search like the global `/Search` advisor side, where the
 * navbar query has already been lowercased + trimmed). Re-normalizes
 * defensively so the read path always crosses `normalizeQueryToken`,
 * matching the write-side tokenizer's normalization invariant.
 * @param table - Harper `tables.AdvisorSearchIndex` handle.
 * @param token - Single token to look up.
 * @returns Distinct advisor ids whose tokens prefix-match the input.
 */
export async function advisorIdsForToken(
  table: unknown,
  token: string
): Promise<readonly string[]> {
  const normalized = normalizeQueryToken(token);
  if (normalized.length < 2) return [];
  const set = await tokenIdsFor(table, normalized);
  return [...set];
}
