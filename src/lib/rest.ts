/**
 * Handles basic auth for this workflow.
 * @param user - Username for authentication.
 * @param password - Password for authentication.
 * @returns The computed value.
 */
export function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

/**
 * Handles required env for this workflow.
 * @param name - Display name or option name.
 * @returns The computed value.
 */
export function requiredEnv(name: string): string {
  const env = Reflect.get(process, "env") as NodeJS.ProcessEnv;
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * Handles rest get for this workflow.
 * @param base - Base URL for relative resolution.
 * @param table - Harper table name.
 * @param auth - auth used by this operation.
 * @returns The computed value.
 */
export async function restGet<T = unknown>(
  base: string,
  table: string,
  auth: string
): Promise<readonly T[]> {
  const res = await fetch(`${stripTrailingSlashes(base)}/${table}/`, {
    headers: { Accept: "application/json", Authorization: auth },
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => []);
  return Array.isArray(body) ? (body as readonly T[]) : [];
}

/**
 * Writes one record through Harper's REST row endpoint.
 * @param base - Base URL for relative resolution.
 * @param table - Harper table name.
 * @param record - Harper row with an id field.
 * @param auth - Prebuilt Basic auth header.
 * @returns True when Harper accepted the row write.
 */
export async function restPut(
  base: string,
  table: string,
  record: Record<string, unknown>,
  auth: string
): Promise<boolean> {
  const id = record.id;
  if (!id) throw new Error(`record missing id: ${JSON.stringify(record)}`);
  const res = await fetch(
    `${stripTrailingSlashes(base)}/${table}/${encodeURIComponent(String(id))}`,
    {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(record),
    }
  );
  if (![200, 201, 204].includes(res.status)) {
    console.error(
      `  ! PUT /${table}/${id} -> ${res.status}: ${(await res.text()).slice(0, 200)}`
    );
    return false;
  }
  return true;
}

const stripTrailingSlashes = (value: string): string => {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
};
