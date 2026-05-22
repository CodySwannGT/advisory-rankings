import { request as httpRequest } from "node:http";
import { Buffer } from "node:buffer";
import { loadCreds } from "../scripts/_auth.js";

export interface HarperConfig {
  target: string;
  socket: string;
  auth: string;
}

function defaultOperationsTarget(clusterUrl: string | undefined): string {
  const normalized = (clusterUrl ?? "").replace(/\/+$/, "");
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    return parsed.port ? normalized : `${normalized}:9925`;
  } catch {
    return normalized;
  }
}

export function harperConfig(env: NodeJS.ProcessEnv = process.env): HarperConfig {
  const creds = loadCreds(env);
  const target = (env.HDB_TARGET_URL ?? defaultOperationsTarget(creds.clusterUrl)).replace(/\/+$/, "");
  const hdbRoot = env.HDB_ROOT ?? `${env.HOME}/.harperdb`;
  const socket = `${hdbRoot}/operations-server`;
  const user = env.HDB_ADMIN_USERNAME ?? creds.username ?? "admin";
  const password = env.HDB_ADMIN_PASSWORD ?? creds.password ?? "admin-local";
  const auth = Buffer.from(`${user}:${password}`).toString("base64");
  return { target, socket, auth };
}

export function describeTarget(): string {
  const { target, socket } = harperConfig();
  return target ? `HTTPS ${target}` : `unix-socket ${socket}`;
}

async function socketPost(socketPath: string, auth: string, body: unknown): Promise<string> {
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
      res => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", chunk => {
          buf += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Harper operation -> HTTP ${res.statusCode}\n${buf.slice(0, 600)}`));
          } else {
            resolve(buf);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

export async function op<T = unknown>(
  payload: Record<string, unknown>,
  timeoutMs = 20_000
): Promise<T> {
  const { target, socket, auth } = harperConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let body: string;
    if (target) {
      const res = await fetch(`${target}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      body = await res.text();
      if (res.status !== 200) {
        throw new Error(`Harper ${payload.operation ?? "operation"} -> HTTP ${res.status}\n${body.slice(0, 600)}`);
      }
    } else {
      body = await socketPost(socket, auth, payload);
    }
    return (body.trim() ? JSON.parse(body) : null) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(
  query: string
): Promise<T[]> {
  return (await op<T[]>({ operation: "sql", sql: query })) ?? [];
}

export async function upsert(
  table: string,
  records: Record<string, unknown>[],
  database = "data"
): Promise<number> {
  if (records.length === 0) return 0;
  const res = await op<{ upserted_hashes?: unknown[] }>({
    operation: "upsert",
    database,
    table,
    records,
  });
  return Array.isArray(res?.upserted_hashes) ? res.upserted_hashes.length : 0;
}

export const insertIdempotent = upsert;
