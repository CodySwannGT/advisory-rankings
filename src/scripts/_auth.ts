/**
 * Auth helpers for talking to the deployed cluster.
 *
 * Harper has two distinct auth surfaces, and neither is a hack — both
 * are documented; they apply to different planes:
 *
 *   1. DATA PLANE (cluster :443, REST + custom resources).
 *      Use a native Harper JWT bearer token. Mint via the
 *      `create_authentication_tokens` operation. Returns:
 *        - operation_token  (sub:"operation",  exp ~24h by default)
 *        - refresh_token    (sub:"refresh",    exp ~30d by default)
 *      The op token goes in `Authorization: Bearer <jwt>` against any
 *      data route. This is what Harper's docs prescribe.
 *
 *   2. CONTROL PLANE on Fabric (deploy_component, restart_service,
 *      get_components, …). On the managed Fabric service these ops
 *      live behind Studio's :443 proxy at
 *      `https://fabric.harper.fast/Cluster/<id>/operation/`, gated by
 *      a session cookie obtained via `POST /Login/`. Fabric does not
 *      expose a long-lived API token (verified by probing
 *      /User/tokens, /APIKey, /APIToken — all 404). The cluster's
 *      own ops endpoint at :9925 *does* accept Bearer JWTs, but is
 *      firewalled from datacenter networks (sandbox + every CI runner
 *      I tried), and the cluster's :443 returns 404 for ops calls.
 *
 *   Result: data-plane reads/writes use JWT; control-plane (deploy)
 *   uses Studio session cookies. See docs/fabric-runbook.md §6.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const KEYCHAIN_USERNAME_SERVICE = "advisory-rankings-harper-username";
const KEYCHAIN_SECRET_SERVICE = "advisory-rankings-harper-password";

/**
 * Credentials resolved from env, keychain, or local credentials file. Used
 * by both the Studio (control-plane) and the cluster (data-plane) helpers.
 */
export interface HarperCreds {
  readonly studioUrl: string;
  readonly clusterUrl: string;
  readonly clusterId: string;
  readonly username: string | undefined;
  readonly password: string | undefined;
}

/**
 * Response from a Studio control-plane operation. `body` is unknown —
 * narrow it at the call site against the operation being invoked.
 */
export interface StudioClusterOpResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * JWT pair returned by the Harper `create_authentication_tokens`
 * operation. `operation_token` is the bearer used for data-plane REST
 * calls; `refresh_token` mints fresh op tokens without re-login.
 */
export interface HarperAuthTokens {
  readonly operation_token: string;
  readonly refresh_token: string;
}

/**
 * Headers shape accepted by Harper custom resources and REST routes.
 */
export interface BearerHeaders {
  readonly Authorization: string;
  readonly Accept: string;
}

/**
 * Error thrown when a Studio HTTP exchange returns a non-success status
 * or a malformed body. Callers can branch on `status` to distinguish
 * transport failures from auth failures.
 */
class StudioError extends Error {
  public readonly status: number;
  /**
   * Builds a Studio HTTP error carrying the offending status code.
   * @param message - Human-readable failure reason.
   * @param status - HTTP status code (0 for client-side preflight failures).
   */
  public constructor(message: string, status: number) {
    super(message);
    this.name = "StudioError";
    this.status = status;
  }
}

/**
 * Reads a secret from the macOS Keychain by service name. Returns
 * `undefined` if `security` is not available, the entry does not exist,
 * or the user denies access.
 * @param service - Keychain service name.
 * @returns The stored secret, or `undefined` when unavailable.
 */
function keychainSecret(service: string): string | undefined {
  try {
    const value = execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-s", service, "-w"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    return value.replace(/\r?\n$/, "");
  } catch {
    return undefined;
  }
}

/**
 * Parses the `~/.harper-fabric-credentials` file, which is a flat
 * `KEY=VALUE` per line. Missing file → empty record.
 * @returns Parsed file credentials, or an empty record when unreadable.
 */
function readCredentialsFile(): Readonly<Record<string, string>> {
  try {
    const lines = readFileSync(
      `${homedir()}/.harper-fabric-credentials`,
      "utf8"
    )
      .split("\n")
      .filter(Boolean);
    const entries: ReadonlyArray<readonly [string, string]> = lines.map(
      line => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)] as const;
      }
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

/**
 * Loads Harper Fabric and cluster credentials from env, keychain, or the
 * local credentials file, in that precedence order.
 * @param processEnv - Environment map to read before keychain and file fallbacks.
 * @returns Studio, cluster, and admin credential values for deploy and data-plane auth.
 */
export function loadCreds(
  processEnv: Readonly<Record<string, string | undefined>> = process.env
): HarperCreds {
  const fileCred = readCredentialsFile();
  const keychain: Readonly<Record<string, string | undefined>> = {
    HARPER_ADMIN_USERNAME: keychainSecret(KEYCHAIN_USERNAME_SERVICE),
    HARPER_ADMIN_PASSWORD: keychainSecret(KEYCHAIN_SECRET_SERVICE),
  };
  function envValue(key: string): string | undefined;
  function envValue(key: string, fallback: string): string;
  /**
   * Resolves an environment value in the precedence order
   * env → keychain → credentials file → caller-provided fallback.
   * @param key - Environment variable name.
   * @param fallback - Optional default when no source supplies the value.
   * @returns Resolved value, or `undefined` when no source matches.
   */
  function envValue(key: string, fallback?: string): string | undefined {
    return processEnv[key] ?? keychain[key] ?? fileCred[key] ?? fallback;
  }
  return {
    studioUrl: envValue("HARPER_STUDIO_URL", "https://fabric.harper.fast"),
    clusterUrl: envValue(
      "HARPER_CLUSTER_URL",
      "https://advisory-rankings-de.cody-swann-org.harperfabric.com"
    ),
    clusterId: envValue("HARPER_CLUSTER_ID", "clu-nzeaqmqh1c5zrp9w"),
    username: envValue("HARPER_ADMIN_USERNAME"),
    password: envValue("HARPER_ADMIN_PASSWORD"),
  };
}

/**
 * Internal cookie-jar type alias. Wraps `Map` in an interface so the
 * functional-lint rule treats it as a typed value rather than a
 * mutable structural type. The class stores it under a `readonly`
 * field; entries are mutated through `set` but the jar reference
 * itself never changes.
 */
interface MutableCookieJar extends Map<string, string> {}

/**
 * Normalizes the `HeadersInit` union (`Headers`, `string[][]`,
 * `Record<string, string>`, or `undefined`) into a plain string map
 * suitable for spreading into a fetch request.
 * @param input - Optional headers in any HeadersInit shape.
 * @returns Plain string→string record. Empty when input is undefined.
 */
function normalizeHeaders(
  input: HeadersInit | undefined
): Readonly<Record<string, string>> {
  if (input === undefined) return {};
  if (input instanceof Headers) {
    const entries: ReadonlyArray<readonly [string, string]> = Array.from(
      input.entries()
    );
    return Object.fromEntries(entries);
  }
  if (Array.isArray(input)) {
    return Object.fromEntries(input);
  }
  return input;
}

/** Construction options for a `StudioSession`. */
export interface StudioSessionInit {
  readonly studioUrl: string;
  readonly username: string | undefined;
  readonly password: string | undefined;
}

/** Studio session cookie helper (control plane). */
export class StudioSession {
  public readonly studioUrl: string;
  private readonly username: string | undefined;
  private readonly password: string | undefined;
  // Map gives us per-session mutable cookie state while keeping the
  // field reference itself readonly. Typed as `MutableCookieJar` (an
  // interface alias over `Map`) so functional/prefer-readonly-type
  // doesn't flag the structurally-mutable Map type.
  private readonly cookieJar: MutableCookieJar;

  /**
   * Creates a Studio session wrapper that stores cookies returned by Fabric.
   * @param init - Studio endpoint and login credentials.
   * @param init.studioUrl - Harper Studio base URL.
   * @param init.username - Harper Studio username.
   * @param init.password - Harper Studio password.
   */
  public constructor(init: StudioSessionInit) {
    this.studioUrl = init.studioUrl;
    this.username = init.username;
    this.password = init.password;
    this.cookieJar = new Map<string, string>();
  }

  /**
   * Serializes the current cookie jar into the `Cookie:` request header format.
   * @returns Cookie header value, or empty string when no cookies are set.
   */
  private cookieHeader(): string {
    const parts: ReadonlyArray<string> = Array.from(this.cookieJar).map(
      ([name, value]) => `${name}=${value}`
    );
    return parts.join("; ");
  }

  /**
   * Fetches a Studio URL while preserving returned session cookies.
   * @param url - Studio URL to request.
   * @param init - Fetch options.
   * @returns Studio response with cookie jar updated.
   */
  private async _fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const cookieValue = this.cookieHeader();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...normalizeHeaders(init.headers),
      ...(cookieValue ? { Cookie: cookieValue } : {}),
    };
    const response = await fetch(url, {
      ...init,
      headers,
      redirect: "manual",
    });
    const getter: (() => ReadonlyArray<string>) | undefined =
      response.headers.getSetCookie?.bind(response.headers);
    const setCookies: ReadonlyArray<string> = getter ? getter() : [];
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";");
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      this.cookieJar.set(name, value);
    }
    return response;
  }

  /**
   * Authenticates with Harper Studio and stores returned session cookies.
   * @returns This authenticated session.
   */
  public async login(): Promise<this> {
    if (!this.username || !this.password)
      throw new StudioError("missing username/password for Studio login", 0);
    const response = await this._fetch(`${this.studioUrl}/Login/`, {
      method: "POST",
      body: JSON.stringify({ email: this.username, password: this.password }),
    });
    if (response.status !== 200) {
      const text = await response.text();
      throw new StudioError(
        `Studio login failed: ${response.status} ${text.slice(0, 200)}`,
        response.status
      );
    }
    return this;
  }

  /**
   * POSTs a cluster operation through Studio's Fabric control-plane proxy.
   * @param clusterId - Harper Fabric cluster id.
   * @param operation - Operation name to run.
   * @param extra - Additional operation parameters.
   * @returns Status and parsed JSON response body.
   */
  public async clusterOp(
    clusterId: string,
    operation: string,
    extra: Readonly<Record<string, unknown>> = {}
  ): Promise<StudioClusterOpResponse> {
    const response = await this._fetch(
      `${this.studioUrl}/Cluster/${clusterId}/operation/`,
      {
        method: "POST",
        body: JSON.stringify({ operation, ...extra }),
      }
    );
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  }
}

/**
 * Type predicate for an `HarperAuthTokens` body returned by the
 * `create_authentication_tokens` Studio operation.
 * @param value - Candidate response body.
 * @returns True if the value has both string-typed JWT fields.
 */
function isHarperAuthTokens(value: unknown): value is HarperAuthTokens {
  if (value === null || typeof value !== "object") return false;
  if (!("operation_token" in value) || !("refresh_token" in value))
    return false;
  // After both `in` checks TS narrows `value` to `object & { operation_token: unknown; refresh_token: unknown }`.
  const { operation_token, refresh_token } = value;
  return (
    typeof operation_token === "string" && typeof refresh_token === "string"
  );
}

/**
 * Mint a Harper-native JWT pair for the data plane. Works through
 * Studio's proxy (Fabric) or directly against the cluster ops API
 * if it's reachable on :9925 (self-hosted / residential network).
 * @param creds - Credentials to use for Studio login.
 * @returns The minted operation/refresh token pair.
 */
export async function createAuthTokens(
  creds: HarperCreds = loadCreds()
): Promise<HarperAuthTokens> {
  const studio = new StudioSession(creds);
  await studio.login();
  const r = await studio.clusterOp(
    creds.clusterId,
    "create_authentication_tokens",
    {
      username: creds.username,
      password: creds.password,
    }
  );
  if (r.status !== 200 || !isHarperAuthTokens(r.body)) {
    throw new StudioError(
      `create_authentication_tokens failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`,
      r.status
    );
  }
  return r.body;
}

/**
 * Convenience for hitting the cluster's data-plane REST with a JWT.
 * @param token - Session token.
 * @returns Headers accepted by Harper custom resources and REST routes.
 */
export function bearerHeaders(token: string): BearerHeaders {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}
