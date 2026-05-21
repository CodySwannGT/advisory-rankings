export const HOST = "https://api.brokercheck.finra.org";
export const DEFAULT_RATE_SECONDS = 1.5;
export const DEFAULT_JITTER_SECONDS = 0.5;
export const DEFAULT_TIMEOUT_MS = 20_000;
export const BACKOFF_LADDER_SECONDS = [5, 15, 45] as const;
export const RATE_LIMIT_BACKOFF_SECONDS = [60, 300, 900] as const;
export const RATE_LIMIT_STOP_AFTER_CONSECUTIVE = 5;

export const DEFAULT_UA =
  "advisory-rankings-research/0.1 " +
  "(+https://github.com/CodySwannGT/advisory-rankings; " +
  "compliance/investor-protection use; contact via repo issues)";

export class BrokerCheckError extends Error {}
export class BrokerCheckBlocked extends BrokerCheckError {}

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForQuota(rateSeconds: number, jitter: number): Promise<void> {
  const now = performance.now();
  const targetGap = Math.max(
    rateSeconds + (Math.random() * jitter * 2 - jitter),
    0.5
  ) * 1000;
  const elapsed = now - lastRequestAt;
  if (elapsed < targetGap) await sleep(targetGap - elapsed);
  lastRequestAt = performance.now();
}

export class BrokerCheckClient {
  readonly rateSeconds: number;
  readonly jitter: number;
  readonly timeoutMs: number;
  readonly ua: string;
  readonly verbose: boolean;
  requestCount = 0;
  consecutiveRateLimits = 0;

  constructor(opts: {
    rateSeconds?: number;
    jitter?: number;
    timeoutMs?: number;
    ua?: string;
    verbose?: boolean;
  } = {}) {
    this.rateSeconds = process.env.BC_RATE_SECONDS
      ? Number(process.env.BC_RATE_SECONDS)
      : (opts.rateSeconds ?? DEFAULT_RATE_SECONDS);
    this.jitter = opts.jitter ?? DEFAULT_JITTER_SECONDS;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.ua = opts.ua ?? DEFAULT_UA;
    this.verbose = opts.verbose ?? true;
  }

  async get(path: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
    const url = `${HOST}${path}?${new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString()}`;
    let lastError: unknown = null;
    for (const backoff of [0, ...BACKOFF_LADDER_SECONDS]) {
      if (backoff) {
        if (this.verbose) console.error(`  [bc] backoff ${backoff}s before retry`);
        await sleep(backoff * 1000);
      }
      await waitForQuota(this.rateSeconds, this.jitter);
      this.requestCount++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": this.ua, Accept: "application/json" },
          signal: controller.signal,
        });
        const text = await response.text();
        if (response.status === 404) {
          this.consecutiveRateLimits = 0;
          throw new BrokerCheckError(`404 for ${url}`);
        }
        if (response.status === 429 || response.status === 403) {
          this.consecutiveRateLimits++;
          const idx = Math.min(
            this.consecutiveRateLimits - 1,
            RATE_LIMIT_BACKOFF_SECONDS.length - 1
          );
          const longBackoff = RATE_LIMIT_BACKOFF_SECONDS[idx];
          if (this.verbose) {
            console.error(
              `  [bc] HTTP ${response.status} (rate-limited) — long backoff ${longBackoff}s (${this.consecutiveRateLimits} consecutive)`
            );
          }
          if (this.consecutiveRateLimits >= RATE_LIMIT_STOP_AFTER_CONSECUTIVE) {
            throw new BrokerCheckBlocked(
              `HTTP ${response.status} ${this.consecutiveRateLimits} times in a row — stopping to avoid a harder block`
            );
          }
          await sleep(longBackoff * 1000);
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
          continue;
        }
        this.consecutiveRateLimits = 0;
        return JSON.parse(text) as Record<string, unknown>;
      } catch (error) {
        if (error instanceof BrokerCheckBlocked || error instanceof BrokerCheckError) {
          throw error;
        }
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new BrokerCheckError(`exhausted retries for ${url}: ${String(lastError)}`);
  }

  searchIndividual(query: string, state?: string, page = 0, rows = 12) {
    const params: Record<string, string | number> = {
      query,
      hl: "true",
      nrows: rows,
      start: page * rows,
      r: 25,
      sort: "score+desc",
      wt: "json",
    };
    if (state) params.state = state;
    return this.get("/search/individual", params);
  }

  getIndividual(crd: string) {
    return this.get(`/search/individual/${crd}`, { wt: "json" });
  }

  searchFirm(query: string, page = 0, rows = 12) {
    return this.get("/search/firm", {
      query,
      hl: "true",
      nrows: rows,
      start: page * rows,
      r: 25,
      sort: "score+desc",
      wt: "json",
    });
  }

  getFirm(firmId: string) {
    return this.get(`/search/firm/${firmId}`, { wt: "json" });
  }

  firmRoster(firmId: string, page = 0, rows = 50) {
    return this.get("/search/individual", {
      query: "",
      firm: firmId,
      hl: "false",
      nrows: rows,
      start: page * rows,
      r: 25,
      wt: "json",
    });
  }
}

export function unwrapIndividual(raw: any): Record<string, unknown> | null {
  const hits = raw?.hits?.hits ?? [];
  const content = hits[0]?._source?.content;
  return content ? JSON.parse(content) : null;
}

export function unwrapFirm(raw: any): Record<string, unknown> | null {
  const hits = raw?.hits?.hits ?? [];
  const content = hits[0]?._source?.content;
  return content ? JSON.parse(content) : null;
}
