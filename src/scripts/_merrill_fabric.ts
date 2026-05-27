import { upsert } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";

/** Fabric operation response returned by the Studio cluster API. */
export interface FabricResponse {
  readonly status: number;
  readonly body: unknown;
}

const FABRIC_UPSERT_BATCH_SIZE = 100;
const FABRIC_UPSERT_RETRIES = 3;

const studioPromise = {
  current: undefined as Promise<StudioSession> | undefined,
};

/**
 * Strips trailing slashes from a URL value.
 * @param value - Input URL string.
 * @returns URL with trailing slashes removed.
 */
const stripTrailingSlashes = (value: string): string => {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
};

/**
 * Resolves the Harper Fabric target URL from env or stored credentials.
 * @returns Cluster URL when configured, otherwise undefined.
 */
export const targetUrl = (): string | undefined => {
  const env = Reflect.get(process, "env") as NodeJS.ProcessEnv;
  const value = env.HDB_TARGET_URL ?? loadCreds().clusterUrl;
  return value ? stripTrailingSlashes(value) : undefined;
};

/**
 * Returns a cached StudioSession login promise.
 * @returns Promise resolving to an authenticated StudioSession.
 */
const studio = async (): Promise<StudioSession> => {
  studioPromise.current ??= new StudioSession(loadCreds()).login();
  return studioPromise.current;
};

/**
 * Splits records into fixed-size batches.
 * @param records - Source records.
 * @param size - Maximum batch size.
 * @returns Array of batches.
 */
const batches = (
  records: ReadonlyArray<Record<string, unknown>>,
  size: number
): ReadonlyArray<ReadonlyArray<Record<string, unknown>>> => {
  return records.length
    ? [records.slice(0, size), ...batches(records.slice(size), size)]
    : [];
};

/**
 * Retries a Fabric upsert operation with linear backoff.
 * @param operation - Upsert invocation.
 * @param attempt - Current attempt number.
 * @returns Successful FabricResponse.
 */
const retryFabricUpsert = async (
  operation: () => Promise<FabricResponse>,
  attempt = 1
): Promise<FabricResponse> => {
  const result = await operation();
  if (result.status === 200) return result;
  if (attempt >= FABRIC_UPSERT_RETRIES) {
    throw new Error(
      `Fabric upsert failed: ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`
    );
  }
  await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  return retryFabricUpsert(operation, attempt + 1);
};

/**
 * Sequentially upserts each batch and returns the running touched-record count.
 *
 * Implemented recursively so each batch's `retryFabricUpsert` call is awaited
 * before the next batch is sent, preserving order and avoiding accidental
 * parallel writes against the Fabric cluster.
 * @param session - Authenticated Studio session.
 * @param clusterId - Target Harper Fabric cluster identifier.
 * @param table - Destination table name.
 * @param remaining - Batches still to upsert.
 * @param touched - Running sum of upserted/touched record counts.
 * @returns Total records touched once every batch has been written.
 */
const fabricUpsertBatches = async (
  session: StudioSession,
  clusterId: string,
  table: string,
  remaining: ReadonlyArray<ReadonlyArray<Record<string, unknown>>>,
  touched: number
): Promise<number> => {
  if (remaining.length === 0) return touched;
  const [batch, ...rest] = remaining;
  const response = await retryFabricUpsert(() =>
    session.clusterOp(clusterId, "upsert", {
      database: "data",
      table,
      records: batch,
    })
  );
  const body = response.body as Partial<
    Record<"upserted_hashes", ReadonlyArray<unknown>>
  >;
  const written = Array.isArray(body.upserted_hashes)
    ? body.upserted_hashes.length
    : batch.length;
  return fabricUpsertBatches(
    session,
    clusterId,
    table,
    rest,
    touched + written
  );
};

/**
 * Upserts records to a Harper table via the Fabric Studio API.
 *
 * Batches are written sequentially — a parallel reduce would race against the
 * Fabric cluster and lose ordering/throttling guarantees.
 * @param table - Destination table name.
 * @param records - Records to upsert.
 * @returns Number of records touched.
 */
const fabricUpsert = async (
  table: string,
  records: ReadonlyArray<Record<string, unknown>>
): Promise<number> => {
  if (records.length === 0) return 0;
  const creds = loadCreds();
  const session = await studio();
  return fabricUpsertBatches(
    session,
    creds.clusterId,
    table,
    batches(records, FABRIC_UPSERT_BATCH_SIZE),
    0
  );
};

/**
 * Writes records to either the Fabric cluster or local Harper.
 * @param table - Destination table name.
 * @param records - Records to write.
 * @returns Number of records touched/upserted.
 */
export const writeRows = async (
  table: string,
  records: ReadonlyArray<Record<string, unknown>>
): Promise<number> => {
  if (targetUrl()) return fabricUpsert(table, records);
  return upsert(table, [...records]);
};
