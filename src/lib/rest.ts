export function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

export async function restGet<T = unknown>(
  base: string,
  table: string,
  auth: string
): Promise<T[]> {
  const res = await fetch(`${base.replace(/\/+$/, "")}/${table}/`, {
    headers: { Accept: "application/json", Authorization: auth },
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => []);
  return Array.isArray(body) ? body as T[] : [];
}

export async function restPut(
  base: string,
  table: string,
  record: Record<string, unknown>,
  auth: string
): Promise<boolean> {
  const id = record.id;
  if (!id) throw new Error(`record missing id: ${JSON.stringify(record)}`);
  const res = await fetch(`${base.replace(/\/+$/, "")}/${table}/${encodeURIComponent(String(id))}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify(record),
  });
  if (![200, 201, 204].includes(res.status)) {
    console.error(`  ! PUT /${table}/${id} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return false;
  }
  return true;
}
