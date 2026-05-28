/** Options for connecting the loader to Harper REST endpoints. */
interface HarperRestOptions {
  readonly baseUrl?: string;
  readonly user?: string;
  readonly password?: string;
  readonly timeoutMs?: number;
  readonly verbose?: boolean;
}

/**
 * Handles harper rest for this workflow.
 */
export class HarperREST {
  readonly base: string;
  readonly auth: string;
  readonly timeoutMs: number;
  readonly verbose: boolean;
  readonly state = { writeCount: 0, readCount: 0 };

  /**
   * Number of REST write operations attempted by this client.
   * @returns Write count.
   */
  get writeCount(): number {
    return this.state.writeCount;
  }

  /**
   * Number of REST read operations attempted by this client.
   * @returns Read count.
   */
  get readCount(): number {
    return this.state.readCount;
  }

  /**
   * Handles constructor for this workflow.
   * @param opts - Options controlling the operation.
   * @param opts.baseUrl - base url used by this operation.
   * @param opts.user - Username for authentication.
   * @param opts.password - Password for authentication.
   * @param opts.timeoutMs - timeout ms used by this operation.
   * @param opts.verbose - verbose used by this operation.
   * @returns The computed value.
   */
  constructor(opts: HarperRestOptions = {}) {
    const env = standaloneEnv();
    this.base = stripTrailingSlashes(opts.baseUrl ?? env.HDB_TARGET_URL ?? "");
    if (!this.base)
      throw new Error("HDB_TARGET_URL required for Harper REST writes");
    const user = stripWrappingQuotes(
      opts.user ?? env.HDB_ADMIN_USERNAME ?? env.HARPER_ADMIN_USERNAME ?? ""
    );
    const password = stripWrappingQuotes(
      opts.password ?? env.HDB_ADMIN_PASSWORD ?? env.HARPER_ADMIN_PASSWORD ?? ""
    );
    if (!user || !password) throw new Error("Harper admin credentials missing");
    this.auth = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.verbose = opts.verbose ?? true;
  }

  /**
   * Handles get for this workflow.
   * @param path - Request path or filesystem path.
   * @param params - Query parameters for the request.
   * @returns The loaded result.
   */
  async get(
    path: string,
    params?: Readonly<Record<string, unknown>>
  ): Promise<unknown> {
    Object.assign(this.state, { readCount: this.state.readCount + 1 });
    const url = new URL(`${this.base}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", Authorization: this.auth },
        signal: controller.signal,
      });
      if (!res.ok) {
        if (this.verbose)
          console.error(
            `  ! GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`
          );
        return null;
      }
      const text = await res.text();
      return text.trim() ? JSON.parse(text) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Writes put to the configured Harper target.
   * @param table - Harper table name.
   * @param record - record used by this operation.
   * @returns The computed value.
   */
  async put(table: string, record: Record<string, unknown>): Promise<boolean> {
    const id = record.id;
    if (!id) throw new Error(`PUT requires id; got ${JSON.stringify(record)}`);
    Object.assign(this.state, { writeCount: this.state.writeCount + 1 });
    const res = await fetch(
      `${this.base}/${table}/${encodeURIComponent(String(id))}`,
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: this.auth,
        },
        body: JSON.stringify(dropUnderscored(record)),
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

  /**
   * Deletes a Harper row by primary key via the public REST endpoint.
   * @param table - Harper table name.
   * @param id - Primary key value to delete.
   * @returns True when the row was deleted or already absent (404).
   */
  async delete(table: string, id: string): Promise<boolean> {
    Object.assign(this.state, { writeCount: this.state.writeCount + 1 });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(
        `${this.base}/${table}/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: { Accept: "application/json", Authorization: this.auth },
          signal: controller.signal,
        }
      );
      if (res.status === 404) return true;
      if (![200, 204].includes(res.status)) {
        console.error(
          `  ! DELETE /${table}/${id} -> ${res.status}: ${(await res.text()).slice(0, 200)}`
        );
        return false;
      }
      return true;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Removes loader-private metadata before writing a row to Harper.
 * @param record - Candidate Harper row with optional underscore-prefixed metadata.
 * @returns Row containing only public, non-null fields.
 */
function dropUnderscored(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) => !key.startsWith("_") && value != null
    )
  );
}

const standaloneEnv = (): NodeJS.ProcessEnv =>
  Reflect.get(process, "env") as NodeJS.ProcessEnv;
const stripTrailingSlashes = (value: string): string =>
  value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
const stripWrappingQuotes = (value: string): string =>
  value
    .split("")
    .filter((char, index, chars) => {
      const quote = ['"', "'", "“", "”"].includes(char);
      return !quote || (index > 0 && index < chars.length - 1);
    })
    .join("");
