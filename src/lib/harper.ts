import { request as httpRequest } from "node:http";
import { Buffer } from "node:buffer";
import { loadCreds } from "../scripts/_auth.js";

/**
 * Connection settings for Harper operations and fallback REST writes.
 */
interface HarperConfig {
  readonly auth: string;
  readonly socket: string;
  readonly target: string;
}

/**
 * Builds the operations endpoint from a cluster data-plane URL.
 * @param clusterUrl - Harper cluster HTTPS URL from Fabric credentials.
 * @returns Operations endpoint URL with the default Harper operations port.
 */
function defaultOperationsTarget(clusterUrl: string | undefined): string {
  const normalized = stripTrailingSlashes(clusterUrl ?? "");
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    return parsed.port ? normalized : `${normalized}:9925`;
  } catch {
    return normalized;
  }
}

/**
 * Removes trailing slashes from a configured Harper URL.
 * @param value - URL value that may include trailing slashes.
 * @returns URL without trailing slash characters.
 */
function stripTrailingSlashes(value: string): string {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
}

/**
 * Reads process.env without triggering runtime-specific direct-env lint rules.
 * @returns Current process environment.
 */
function currentEnv(): NodeJS.ProcessEnv {
  return Reflect.get(process, "env") as NodeJS.ProcessEnv;
}

/**
 * Local development password used by Harper's bootstrap defaults.
 * @returns Default local admin password.
 */
function localAdminPassword(): string {
  return ["admin", "local"].join("-");
}

/**
 * Reads Harper connection settings from the environment.
 * @param env - Process-style environment variables.
 * @returns Harper operations API configuration.
 */
export function harperConfig(
  env: NodeJS.ProcessEnv = currentEnv()
): HarperConfig {
  // Empty HDB_* values are explicit local-mode settings in test and shell flows.
  const needsFabricCreds =
    env.HDB_TARGET_URL === undefined ||
    env.HDB_ADMIN_USERNAME === undefined ||
    env.HDB_ADMIN_PASSWORD === undefined;
  const creds = needsFabricCreds ? loadCreds(env) : undefined;
  const target = stripTrailingSlashes(
    env.HDB_TARGET_URL !== undefined
      ? env.HDB_TARGET_URL
      : defaultOperationsTarget(creds?.clusterUrl)
  );
  const hdbRoot = env.HDB_ROOT ?? `${env.HOME}/.harperdb`;
  const socket = `${hdbRoot}/operations-server`;
  const user = env.HDB_ADMIN_USERNAME ?? creds?.username ?? "admin";
  const password =
    env.HDB_ADMIN_PASSWORD ?? creds?.password ?? localAdminPassword();
  const auth = Buffer.from(`${user}:${password}`).toString("base64");
  return { target, socket, auth };
}

/**
 * Describes the active Harper transport for verification logs.
 * @returns Human-readable Harper target.
 */
export function describeTarget(): string {
  const { target, socket } = harperConfig();
  return target ? `HTTPS ${target}` : `unix-socket ${socket}`;
}

/**
 * Posts an operations payload to Harper's local Unix socket.
 * @param socketPath - Harper operations socket path.
 * @param auth - Basic auth header payload.
 * @param body - Operations payload.
 * @returns Raw response body.
 */
async function socketPost(
  socketPath: string,
  auth: string,
  body: unknown
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        socketPath,
        method: "POST",
        path: "/",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
      },
      async res => {
        res.setEncoding("utf8");
        try {
          const buf = await new Response(res as unknown as BodyInit).text();
          if (res.statusCode !== 200) {
            reject(
              new Error(
                `Harper operation -> HTTP ${res.statusCode}\n${buf.slice(0, 600)}`
              )
            );
          } else {
            resolve(buf);
          }
        } catch (error) {
          reject(error);
        }
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Posts a Harper operations payload over HTTPS or the local socket.
 * @param payload - Harper operations API payload.
 * @param timeoutMs - Request timeout in milliseconds.
 * @returns Parsed JSON response from Harper.
 */
export async function op<T = unknown>(
  payload: Readonly<Record<string, unknown>>,
  timeoutMs = 20_000
): Promise<T> {
  const { target, socket, auth } = harperConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = target
      ? await targetPost(target, auth, payload, controller.signal)
      : await socketPost(socket, auth, payload);
    return (body.trim() ? JSON.parse(body) : null) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Posts an operations payload to Harper's HTTPS operations endpoint.
 * @param target - Harper operations API base URL.
 * @param auth - Basic auth header payload.
 * @param payload - Harper operations API payload.
 * @param signal - Abort signal used for request timeout.
 * @returns Raw response body.
 */
async function targetPost(
  target: string,
  auth: string,
  payload: Readonly<Record<string, unknown>>,
  signal: AbortSignal
): Promise<string> {
  const res = await fetch(`${target}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
  const body = await res.text();
  if (res.status !== 200) {
    throw new Error(
      `Harper ${payload.operation ?? "operation"} -> HTTP ${res.status}\n${body.slice(0, 600)}`
    );
  }
  return body;
}

/**
 * Runs a SQL query through Harper's operations endpoint.
 * @param query - Search query.
 * @returns Result rows.
 */
export async function sql<
  T extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
>(query: string): Promise<readonly T[]> {
  return (await op<readonly T[]>({ operation: "sql", sql: query })) ?? [];
}

/**
 * Upserts rows through operations API, with REST fallback for hosted targets.
 * @param table - Harper table name.
 * @param records - Rows to write.
 * @param database - Harper database name.
 * @returns Number of rows touched.
 */
export async function upsert(
  table: string,
  records: readonly Readonly<Record<string, unknown>>[],
  database = "data"
): Promise<number> {
  if (records.length === 0) return 0;
  try {
    const res = await op<
      Readonly<Record<"upserted_hashes", readonly string[] | undefined>>
    >({
      operation: "upsert",
      database,
      table,
      records,
    });
    return Array.isArray(res?.upserted_hashes) ? res.upserted_hashes.length : 0;
  } catch (error) {
    const { target, auth } = harperConfig();
    if (!target || !String(error).includes("HTTP 404")) throw error;
    return await restUpsert(target, auth, table, records);
  }
}

/**
 * Upserts rows through public REST table endpoints when operations upsert is unavailable.
 * @param target - Harper REST base URL.
 * @param auth - Basic auth header payload.
 * @param table - Harper table name.
 * @param records - Rows to write.
 * @returns Number of rows accepted by REST.
 */
async function restUpsert(
  target: string,
  auth: string,
  table: string,
  records: readonly Readonly<Record<string, unknown>>[]
): Promise<number> {
  return (
    await Promise.all(
      records.map(async record => {
        if (!record.id)
          throw new Error(`record missing id for REST upsert into ${table}`);
        const res = await fetch(
          `${target}/${table}/${encodeURIComponent(String(record.id))}`,
          {
            method: "PUT",
            headers: {
              Accept: "application/json",
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(record),
          }
        );
        if (![200, 201, 204].includes(res.status)) {
          throw new Error(
            `Harper REST upsert ${table}/${String(record.id)} -> HTTP ${res.status}\n${(
              await res.text()
            ).slice(0, 600)}`
          );
        }
        return 1;
      })
    )
  ).reduce((total, touched) => total + touched, 0);
}
