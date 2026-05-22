const HOST = "https://api.brokercheck.finra.org";
const DEFAULT_RATE_SECONDS = 1.5;
const DEFAULT_JITTER_SECONDS = 0.5;
const DEFAULT_TIMEOUT_MS = 20_000;
const BACKOFF_LADDER_SECONDS = [5, 15, 45] as const;
const RATE_LIMIT_BACKOFF_SECONDS = [60, 300, 900] as const;
const RATE_LIMIT_STOP_AFTER_CONSECUTIVE = 5;

const DEFAULT_UA =
  "advisory-rankings-research/0.1 " +
  "(+https://github.com/CodySwannGT/advisory-rankings; " +
  "compliance/investor-protection use; contact via repo issues)";

/**
 * Base error for BrokerCheck request failures.
 */
class BrokerCheckError extends Error {}
/**
 * Handles broker check blocked for this workflow.
 * @returns The computed value.
 */
export class BrokerCheckBlocked extends BrokerCheckError {}

const quotaState = { lastRequestAt: 0 };

/**
 * BrokerCheck client configuration.
 */
interface BrokerCheckClientOptions {
  readonly jitter?: number;
  readonly rateSeconds?: number;
  readonly timeoutMs?: number;
  readonly ua?: string;
  readonly verbose?: boolean;
}

/**
 * Handles sleep for this workflow.
 * @param ms - Delay duration in milliseconds.
 * @returns Promise that resolves after the delay.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Waits until the next BrokerCheck request fits the configured rate limit.
 * @param rateSeconds - Minimum request spacing in seconds.
 * @param jitter - Randomized request spacing window in seconds.
 * @returns Promise that resolves when the next request may start.
 */
async function waitForQuota(
  rateSeconds: number,
  jitter: number
): Promise<void> {
  const now = performance.now();
  const targetGap =
    Math.max(rateSeconds + (secureRandomUnit() * jitter * 2 - jitter), 0.5) *
    1000;
  const elapsed = now - quotaState.lastRequestAt;
  if (elapsed < targetGap) await sleep(targetGap - elapsed);
  Object.assign(quotaState, { lastRequestAt: performance.now() });
}

/**
 * Generates a non-cryptographic unit interval using the platform CSPRNG.
 * @returns Number in the half-open [0, 1) range.
 */
function secureRandomUnit(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

/**
 * Handles broker check client for this workflow.
 */
export class BrokerCheckClient {
  readonly rateSeconds: number;
  readonly jitter: number;
  readonly timeoutMs: number;
  readonly ua: string;
  readonly verbose: boolean;
  readonly state = { requestCount: 0, consecutiveRateLimits: 0 };

  /**
   * Number of HTTP requests attempted by this client.
   * @returns Request count.
   */
  get requestCount(): number {
    return this.state.requestCount;
  }

  /**
   * Number of consecutive rate-limit responses seen by this client.
   * @returns Consecutive rate-limit count.
   */
  get consecutiveRateLimits(): number {
    return this.state.consecutiveRateLimits;
  }

  /**
   * Handles constructor for this workflow.
   * @param opts - Options controlling the operation.
   * @param opts.rateSeconds - Minimum request spacing in seconds.
   * @param opts.jitter - Randomized request spacing window in seconds.
   * @param opts.timeoutMs - timeout ms used by this operation.
   * @param opts.ua - ua used by this operation.
   * @param opts.verbose - verbose used by this operation.
   */
  constructor(opts: BrokerCheckClientOptions = {}) {
    const env = Reflect.get(process, "env") as NodeJS.ProcessEnv;
    this.rateSeconds = env.BC_RATE_SECONDS
      ? Number(env.BC_RATE_SECONDS)
      : (opts.rateSeconds ?? DEFAULT_RATE_SECONDS);
    this.jitter = opts.jitter ?? DEFAULT_JITTER_SECONDS;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.ua = opts.ua ?? DEFAULT_UA;
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
    params: Readonly<Record<string, string | number>>
  ): Promise<Record<string, unknown>> {
    const url = `${HOST}${path}?${new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString()}`;
    return this.getWithRetries(url, [0, ...BACKOFF_LADDER_SECONDS]);
  }

  /**
   * Attempts a BrokerCheck request through the configured backoff ladder.
   * @param url - Fully qualified BrokerCheck API URL.
   * @param backoffs - Remaining retry backoffs in seconds.
   * @param lastError - Last recoverable error, used in the final failure.
   * @returns Parsed JSON response.
   */
  async getWithRetries(
    url: string,
    backoffs: readonly number[],
    lastError: unknown = null
  ): Promise<Record<string, unknown>> {
    const [backoff, ...remaining] = backoffs;
    if (backoff == null)
      throw new BrokerCheckError(
        `exhausted retries for ${url}: ${String(lastError)}`
      );
    try {
      return await this.getOnce(url, backoff);
    } catch (error) {
      if (
        error instanceof BrokerCheckBlocked ||
        error instanceof BrokerCheckError
      )
        throw error;
      return this.getWithRetries(url, remaining, error);
    }
  }

  /**
   * Performs one BrokerCheck request attempt after an optional retry delay.
   * @param url - Fully qualified BrokerCheck API URL.
   * @param backoff - Retry delay in seconds before this attempt.
   * @returns Parsed JSON response.
   */
  async getOnce(
    url: string,
    backoff: number
  ): Promise<Record<string, unknown>> {
    if (backoff) await this.pauseForBackoff(backoff);
    await waitForQuota(this.rateSeconds, this.jitter);
    Object.assign(this.state, { requestCount: this.state.requestCount + 1 });
    return this.fetchJson(url);
  }

  /**
   * Logs and sleeps before a retry attempt.
   * @param backoff - Retry delay in seconds.
   */
  async pauseForBackoff(backoff: number): Promise<void> {
    if (this.verbose) console.error(`  [bc] backoff ${backoff}s before retry`);
    await sleep(backoff * 1000);
  }

  /**
   * Fetches one BrokerCheck URL and handles response status semantics.
   * @param url - Fully qualified BrokerCheck API URL.
   * @returns Parsed JSON response.
   */
  async fetchJson(url: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": this.ua, Accept: "application/json" },
        signal: controller.signal,
      });
      const text = await response.text();
      return await this.parseResponse(url, response, text);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Converts BrokerCheck HTTP responses into parsed JSON or retry errors.
   * @param url - Fully qualified BrokerCheck API URL.
   * @param response - Fetch response.
   * @param text - Response text body.
   * @returns Parsed JSON response.
   */
  async parseResponse(
    url: string,
    response: Response,
    text: string
  ): Promise<Record<string, unknown>> {
    if (response.status === 404) {
      Object.assign(this.state, { consecutiveRateLimits: 0 });
      throw new BrokerCheckError(`404 for ${url}`);
    }
    if (response.status === 429 || response.status === 403) {
      await this.handleRateLimit(response.status);
      throw new Error(`HTTP ${response.status}`);
    }
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    Object.assign(this.state, { consecutiveRateLimits: 0 });
    return JSON.parse(text) as Record<string, unknown>;
  }

  /**
   * Applies BrokerCheck's longer backoff ladder for rate-limit responses.
   * @param status - HTTP status code returned by BrokerCheck.
   */
  async handleRateLimit(status: number): Promise<void> {
    const nextCount = this.state.consecutiveRateLimits + 1;
    const idx = Math.min(nextCount - 1, RATE_LIMIT_BACKOFF_SECONDS.length - 1);
    const longBackoff = RATE_LIMIT_BACKOFF_SECONDS[idx];
    Object.assign(this.state, { consecutiveRateLimits: nextCount });
    if (this.verbose)
      console.error(
        `  [bc] HTTP ${status} (rate-limited) — long backoff ${longBackoff}s (${nextCount} consecutive)`
      );
    if (nextCount >= RATE_LIMIT_STOP_AFTER_CONSECUTIVE) {
      throw new BrokerCheckBlocked(
        `HTTP ${status} ${nextCount} times in a row — stopping to avoid a harder block`
      );
    }
    await sleep(longBackoff * 1000);
  }

  /**
   * Searches individual using the configured source.
   * @param query - Search query.
   * @param state - Mutable crawl state.
   * @param page - page used by this operation.
   * @param rows - Rows to transform or search.
   * @returns The loaded result.
   */
  searchIndividual(query: string, state?: string, page = 0, rows = 12) {
    const params = {
      query,
      ...(state ? { state } : {}),
      hl: "true",
      nrows: rows,
      start: page * rows,
      r: 25,
      sort: "score+desc",
      wt: "json",
    };
    return this.get("/search/individual", params);
  }

  /**
   * Gets individual for downstream processing.
   * @param crd - FINRA CRD identifier.
   * @returns The loaded result.
   */
  getIndividual(crd: string) {
    return this.get(`/search/individual/${crd}`, { wt: "json" });
  }

  /**
   * Searches firm using the configured source.
   * @param query - Search query.
   * @param page - page used by this operation.
   * @param rows - Rows to transform or search.
   * @returns The loaded result.
   */
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

  /**
   * Gets firm for downstream processing.
   * @param firmId - Firm identifier.
   * @returns The loaded result.
   */
  getFirm(firmId: string) {
    return this.get(`/search/firm/${firmId}`, { wt: "json" });
  }

  /**
   * Handles firm roster for this workflow.
   * @param firmId - Firm identifier.
   * @param page - page used by this operation.
   * @param rows - Rows to transform or search.
   * @returns The computed value.
   */
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

/**
 * Handles unwrap individual for this workflow.
 * @param raw - Raw source payload.
 * @returns The computed value.
 */
function unwrapContent(raw: unknown): Record<string, unknown> | null {
  const envelope = raw as Readonly<Record<string, unknown>>;
  const hitsBox = envelope.hits as
    | Readonly<Record<string, unknown>>
    | undefined;
  const hits = Array.isArray(hitsBox?.hits) ? hitsBox.hits : [];
  const first = hits[0] as Readonly<Record<string, unknown>> | undefined;
  const source = first?._source as
    | Readonly<Record<string, unknown>>
    | undefined;
  const content = source?.content;
  return typeof content === "string" && content ? JSON.parse(content) : null;
}

/**
 * Extracts individual content from a BrokerCheck search envelope.
 * @param raw - Raw BrokerCheck response payload.
 * @returns Parsed individual content or null.
 */
export function unwrapIndividual(raw: unknown): Record<string, unknown> | null {
  return unwrapContent(raw);
}

/**
 * Extracts firm content from a BrokerCheck search envelope.
 * @param raw - Raw BrokerCheck response payload.
 * @returns Parsed firm content or null.
 */
export function unwrapFirm(raw: unknown): Record<string, unknown> | null {
  return unwrapContent(raw);
}
