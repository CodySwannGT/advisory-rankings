// @ts-nocheck
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
 * @returns The computed value.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const KEYCHAIN_USERNAME_SERVICE = "advisory-rankings-harper-username";
const KEYCHAIN_SECRET_SERVICE = "advisory-rankings-harper-password";

/**
 * Handles keychain secret for this workflow.
 * @param service - Keychain service name.
 * @returns The computed value.
 */
function keychainSecret(service) {
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
 * Loads Harper Fabric and cluster credentials from env, keychain, or the local credentials file.
 * @param processEnv - Environment map to read before keychain and file fallbacks.
 * @returns Studio, cluster, and admin credential values for deploy and data-plane auth.
 */
export function loadCreds(processEnv = process.env) {
  const fileCred = (() => {
    try {
      return Object.fromEntries(
        readFileSync(`${homedir()}/.harper-fabric-credentials`, "utf8")
          .split("\n")
          .filter(Boolean)
          .map(line => {
            const index = line.indexOf("=");
            return [line.slice(0, index), line.slice(index + 1)];
          })
      );
    } catch {
      return {};
    }
  })();
  const keychain = {
    HARPER_ADMIN_USERNAME: keychainSecret(KEYCHAIN_USERNAME_SERVICE),
    HARPER_ADMIN_PASSWORD: keychainSecret(KEYCHAIN_SECRET_SERVICE),
  };
  const env = (key, fallback) =>
    processEnv[key] ?? keychain[key] ?? fileCred[key] ?? fallback;
  return {
    studioUrl: env("HARPER_STUDIO_URL", "https://fabric.harper.fast"),
    clusterUrl: env(
      "HARPER_CLUSTER_URL",
      "https://advisory-rankings-de.cody-swann-org.harperfabric.com"
    ),
    clusterId: env("HARPER_CLUSTER_ID", "clu-nzeaqmqh1c5zrp9w"),
    username: env("HARPER_ADMIN_USERNAME"),
    password: env("HARPER_ADMIN_PASSWORD"),
  };
}

/** Studio session cookie helper (control plane). */
export class StudioSession {
  /**
   * Creates a Studio session wrapper that stores cookies returned by Fabric.
   * @param root0 - Studio endpoint and login credentials.
   * @param root0.studioUrl - Harper Studio base URL.
   * @param root0.username - Harper Studio username.
   * @param root0.password - Harper Studio password.
   */
  constructor({ studioUrl, username, password }) {
    this.studioUrl = studioUrl;
    this.username = username;
    this.password = password;
    this.cookieJar = "";
  }

  /**
   * Fetches a Studio URL while preserving returned session cookies.
   * @param url - Studio URL to request.
   * @param init - Fetch options.
   * @returns Studio response with cookie jar updated.
   */
  async _fetch(url, init = {}) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
        ...(this.cookieJar ? { Cookie: this.cookieJar } : {}),
      },
      redirect: "manual",
    });
    const setCookies = response.headers.getSetCookie?.() || [];
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";");
      const [name] = pair.split("=");
      const existing = this.cookieJar
        .split("; ")
        .filter(Boolean)
        .filter(entry => !entry.startsWith(`${name}=`));
      this.cookieJar = [...existing, pair].join("; ");
    }
    return response;
  }

  /**
   * Authenticates with Harper Studio and stores returned session cookies.
   * @returns This authenticated session.
   */
  async login() {
    if (!this.username || !this.password)
      throw new Error("missing username/password for Studio login");
    const response = await this._fetch(`${this.studioUrl}/Login/`, {
      method: "POST",
      body: JSON.stringify({ email: this.username, password: this.password }),
    });
    if (response.status !== 200) {
      const text = await response.text();
      throw new Error(
        `Studio login failed: ${response.status} ${text.slice(0, 200)}`
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
  async clusterOp(clusterId, operation, extra = {}) {
    const response = await this._fetch(
      `${this.studioUrl}/Cluster/${clusterId}/operation/`,
      {
        method: "POST",
        body: JSON.stringify({ operation, ...extra }),
      }
    );
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  }
}

/**
 * Mint a Harper-native JWT pair for the data plane. Works through
 * Studio's proxy (Fabric) or directly against the cluster ops API
 * if it's reachable on :9925 (self-hosted / residential network).
 * @param creds - creds used by this operation.
 * @returns The computed value.
 */
export async function createAuthTokens(creds = loadCreds()) {
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
  if (r.status !== 200 || !r.body?.operation_token) {
    throw new Error(
      `create_authentication_tokens failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`
    );
  }
  return r.body; // { operation_token, refresh_token }
}

/**
 * Convenience for hitting the cluster's data-plane REST with a JWT.
 * @param token - Session token.
 * @returns Headers accepted by Harper custom resources and REST routes.
 */
export function bearerHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}
