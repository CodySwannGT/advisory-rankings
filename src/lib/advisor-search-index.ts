import type { HarperREST } from "./brokercheck-rest.js";
import { op, sql, upsert } from "./harper.js";
import { uid } from "./ids.js";
import { tokensForAdvisor, type AdvisorRow } from "./advisor-tokens.js";

/**
 * One row in the AdvisorSearchIndex table. The `id` is uuidv5 of
 * `ASI:advisorId:kind:token` so identical re-indexes produce identical
 * primary keys (idempotent upsert; no orphan tokens after a write-path
 * diff).
 */
export interface AdvisorSearchIndexRow {
  readonly id: string;
  readonly advisorId: string;
  readonly token: string;
  readonly kind: string;
}

/**
 * Result counts for {@link reindexAdvisorTokens}.
 */
interface ReindexSummary {
  readonly added: number;
  readonly removed: number;
}

/**
 * Soft cap on concurrent REST writes/deletes per batch in the
 * REST-backed handle. Backfilling 13k advisors produces tens of
 * thousands of token rows; without chunking, `Promise.all(...)` would
 * fan out into thousands of concurrent PUT/DELETE requests and
 * saturate Fabric's REST surface.
 */
const REST_BATCH_SIZE = 25;

const chunkArray = <T>(
  items: readonly T[],
  size: number
): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_unused, index) =>
    items.slice(index * size, index * size + size)
  );

/**
 * Injectable Harper IO surface for the reindex algorithm. Every reindex
 * call MUST supply a handle — production code constructs a Harper-backed
 * one (`createHarperOpAdvisorSearchIndexHandle`,
 * `createRestAdvisorSearchIndexHandle`), tests pass an in-memory stub.
 * There is no global default: that prevents accidental network calls from
 * code paths that should be hermetic (loaders called by unit tests).
 */
export interface AdvisorSearchIndexHandle {
  readonly getAdvisor: (id: string) => Promise<AdvisorRow | null>;
  readonly listTokensForAdvisor: (
    advisorId: string
  ) => Promise<readonly AdvisorSearchIndexRow[]>;
  readonly upsertTokens: (
    rows: readonly AdvisorSearchIndexRow[]
  ) => Promise<void>;
  readonly deleteTokens: (ids: readonly string[]) => Promise<void>;
}

/**
 * Composite-primary-key uid for one AdvisorSearchIndex row. The
 * `ASI` prefix namespaces this id against other entity ids in the same
 * uuidv5 namespace; advisorId+kind+token guarantee a stable PK so a
 * reindex of the same advisor with the same tokens produces the same
 * ids (no churn) and a different set of tokens produces a clean diff.
 * @param advisorId - Stable advisor id from the Advisor table.
 * @param kind - Token kind (name | firstName | lastName | …).
 * @param token - Normalized token string.
 * @returns Deterministic AdvisorSearchIndex.id.
 */
export function advisorSearchIndexId(
  advisorId: string,
  kind: string,
  token: string
): string {
  return uid(`ASI:${advisorId}:${kind}:${token}`);
}

const desiredRowsFor = (
  advisor: AdvisorRow
): readonly AdvisorSearchIndexRow[] =>
  tokensForAdvisor(advisor).map(({ token, kind }) => ({
    id: advisorSearchIndexId(advisor.id, kind, token),
    advisorId: advisor.id,
    token,
    kind,
  }));

/**
 *
 */
interface AdvisorDiff {
  readonly toAdd: readonly AdvisorSearchIndexRow[];
  readonly toRemove: readonly string[];
}

const diffOne = async (
  handle: AdvisorSearchIndexHandle,
  advisorId: string
): Promise<AdvisorDiff> => {
  const [advisor, existing] = await Promise.all([
    handle.getAdvisor(advisorId),
    handle.listTokensForAdvisor(advisorId),
  ]);
  const desired = advisor ? desiredRowsFor(advisor) : [];
  const desiredIds = new Set(desired.map(r => r.id));
  const existingIds = new Set(existing.map(r => r.id));
  return {
    toAdd: desired.filter(r => !existingIds.has(r.id)),
    toRemove: existing.filter(r => !desiredIds.has(r.id)).map(r => r.id),
  };
};

/**
 * Reindexes AdvisorSearchIndex token rows for a batch of advisors. Pure
 * diff against the canonical token set: same advisor row → same desired
 * ids → zero-op when called twice in a row.
 * @param handle - Harper IO surface (REST, operations-API, or stub).
 * @param advisorIds - Advisor ids to reindex.
 * @returns Counts of added and removed token rows.
 */
export async function reindexAdvisorTokens(
  handle: AdvisorSearchIndexHandle,
  advisorIds: readonly string[]
): Promise<ReindexSummary> {
  if (advisorIds.length === 0) return { added: 0, removed: 0 };
  const diffs = await Promise.all(advisorIds.map(id => diffOne(handle, id)));
  const toAdd = diffs.flatMap(d => d.toAdd);
  const toRemove = diffs.flatMap(d => d.toRemove);
  if (toAdd.length > 0) await handle.upsertTokens(toAdd);
  if (toRemove.length > 0) await handle.deleteTokens(toRemove);
  return { added: toAdd.length, removed: toRemove.length };
}

// ── Harper operations-API handle ──────────────────────────────────────────

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const narrowAdvisorRow = (
  raw: Readonly<Record<string, unknown>>
): AdvisorRow => ({
  id: String(raw.id ?? ""),
  legalName: stringOrNull(raw.legalName),
  firstName: stringOrNull(raw.firstName),
  lastName: stringOrNull(raw.lastName),
  preferredName: stringOrNull(raw.preferredName),
});

const narrowTokenRow = (
  raw: Readonly<Record<string, unknown>>
): AdvisorSearchIndexRow => ({
  id: String(raw.id ?? ""),
  advisorId: String(raw.advisorId ?? ""),
  token: String(raw.token ?? ""),
  kind: String(raw.kind ?? ""),
});

const escapeSqlString = (value: string): string =>
  `'${value.replace(/'/gu, "''")}'`;

/**
 * Harper operations-API handle. Reads via `sql()`, writes via `upsert()`,
 * deletes via `op({operation:'delete'})`. Use from scripts that connect
 * directly to Harper (backfill, CLI shim, loader scripts).
 * @returns Handle backed by the operations API.
 */
export function createHarperOpAdvisorSearchIndexHandle(): AdvisorSearchIndexHandle {
  return {
    getAdvisor: async (id: string) => {
      const rows = await sql(
        `SELECT id, legalName, firstName, lastName, preferredName FROM data.Advisor WHERE id = ${escapeSqlString(id)} LIMIT 1`
      );
      const first = rows[0];
      return first ? narrowAdvisorRow(first) : null;
    },
    listTokensForAdvisor: async (advisorId: string) => {
      const rows = await sql(
        `SELECT id, advisorId, token, kind FROM data.AdvisorSearchIndex WHERE advisorId = ${escapeSqlString(advisorId)}`
      );
      return rows.map(narrowTokenRow);
    },
    upsertTokens: async (rows: readonly AdvisorSearchIndexRow[]) => {
      if (rows.length === 0) return;
      await upsert(
        "AdvisorSearchIndex",
        rows.map(r => ({ ...r }))
      );
    },
    deleteTokens: async (ids: readonly string[]) => {
      if (ids.length === 0) return;
      await op({
        operation: "delete",
        database: "data",
        table: "AdvisorSearchIndex",
        hash_values: ids,
      });
    },
  };
}

// ── Harper REST handle ────────────────────────────────────────────────────

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};

/**
 * Harper REST handle. Reads/writes go through the same `HarperREST`
 * client the BrokerCheck loader uses, so loader-side reindex traffic
 * shares the same auth, base URL, and counters as the surrounding writes
 * (and tests that stub `HarperREST` automatically stub the reindex too).
 * @param rest - Active Harper REST client.
 * @returns Handle backed by the REST client.
 */
export function createRestAdvisorSearchIndexHandle(
  rest: HarperREST
): AdvisorSearchIndexHandle {
  return {
    getAdvisor: async (id: string) => {
      const raw = await rest.get("/Advisor/", { id });
      const first = asArray(raw)[0];
      return first ? narrowAdvisorRow(asRecord(first)) : null;
    },
    listTokensForAdvisor: async (advisorId: string) => {
      const raw = await rest.get("/AdvisorSearchIndex/", { advisorId });
      return asArray(raw).map(row => narrowTokenRow(asRecord(row)));
    },
    upsertTokens: async (rows: readonly AdvisorSearchIndexRow[]) => {
      // Chunk the writes so a 13k-row backfill cannot fan out into
      // thousands of concurrent PUTs.
      // Throw on non-2xx so stale token rows cannot outlive the advisor.
      for (const batch of chunkArray(rows, REST_BATCH_SIZE)) {
        const results = await Promise.all(
          batch.map(row => rest.put("AdvisorSearchIndex", { ...row }))
        );
        const failed = results.filter(ok => !ok).length;
        if (failed > 0)
          throw new Error(
            `advisor-search-index: ${failed}/${batch.length} AdvisorSearchIndex PUTs failed (see HarperREST stderr)`
          );
      }
    },
    deleteTokens: deleteSearchTokens(rest),
  };
}

/**
 * Builds fail-fast REST token deletion for advisor search index rows.
 * @param rest Active Harper REST client.
 * @returns Token deletion callback.
 */
function deleteSearchTokens(rest: HarperREST) {
  return async (ids: readonly string[]) => {
    for (const batch of chunkArray(ids, REST_BATCH_SIZE)) {
      const results = await Promise.all(
        batch.map(id => rest.delete("AdvisorSearchIndex", id))
      );
      const failed = results.filter(ok => !ok).length;
      if (failed > 0)
        throw new Error(
          `advisor-search-index: ${failed}/${batch.length} AdvisorSearchIndex DELETEs failed (see HarperREST stderr)`
        );
    }
  };
}
