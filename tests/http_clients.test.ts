import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrokerCheckBlocked,
  BrokerCheckClient,
  unwrapFirm,
  unwrapIndividual,
} from "../src/lib/brokercheck.js";
import { basicAuth, restGet, restPut } from "../src/lib/rest.js";
import { describeTarget, harperConfig, op, upsert } from "../src/lib/harper.js";
import { HarperREST } from "../src/lib/brokercheck-rest.js";
import { teamMemberGroups } from "../src/harper/resource-team.js";

const EXAMPLE_TEST_HOST = "https://example.test";
const USER_EMAIL = "user@example.test";
const SEARCH_INDIVIDUAL_PATH = "/search/individual";
const CLUSTER_EXAMPLE_HOST = "https://cluster.example";

/**
 * Minimal Harper Resource shim for auth resource unit tests.
 */
class Resource {
  /**
   * Returns the injected context for the resource instance.
   * @returns Test context attached to the instance.
   */
  getContext() {
    return (this as any).context;
  }

  /**
   * Returns the injected current user for the resource instance.
   * @returns Test user attached to the instance.
   */
  getCurrentUser() {
    return (this as any).user;
  }
}

(globalThis as any).Resource = Resource;

const authResources = await import("../src/harper/resource-auth-endpoints.js");

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const textResponse = (body: string, init: ResponseInit = {}) =>
  new Response(init.status === 204 ? null : body, init);

const withEnv = async (
  env: NodeJS.ProcessEnv,
  operation: () => Promise<void> | void
) => {
  const original = { ...process.env };
  process.env = { ...original, ...env };
  try {
    await operation();
  } finally {
    process.env = original;
  }
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("REST helpers", () => {
  it("normalizes auth and reads table responses defensively", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: "row-1" }]))
      .mockResolvedValueOnce(jsonResponse({ id: "not-an-array" }))
      .mockResolvedValueOnce(textResponse("missing", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(basicAuth("admin", "secret")).toBe("Basic YWRtaW46c2VjcmV0");
    await expect(
      restGet("https://example.test///", "Firm", "auth")
    ).resolves.toEqual([{ id: "row-1" }]);
    await expect(restGet(EXAMPLE_TEST_HOST, "Firm", "auth")).resolves.toEqual(
      []
    );
    await expect(restGet(EXAMPLE_TEST_HOST, "Firm", "auth")).resolves.toEqual(
      []
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.test/Firm/");
  });

  it("writes records and reports rejected REST writes", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse("", { status: 204 }))
      .mockResolvedValueOnce(textResponse("bad row", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      restPut(EXAMPLE_TEST_HOST, "Advisor", { id: "A B" }, "auth")
    ).resolves.toBe(true);
    await expect(
      restPut(EXAMPLE_TEST_HOST, "Advisor", { id: "bad" }, "auth")
    ).resolves.toBe(false);
    await expect(
      restPut(EXAMPLE_TEST_HOST, "Advisor", {}, "auth")
    ).rejects.toThrow("record missing id");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://example.test/Advisor/A%20B"
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("bad row"));
  });
});

describe("BrokerCheck REST adapter", () => {
  it("requires target and credentials", async () => {
    await withEnv(
      {
        HDB_ADMIN_PASSWORD: "",
        HDB_ADMIN_USERNAME: "",
        HDB_TARGET_URL: "",
        HARPER_ADMIN_PASSWORD: "",
        HARPER_ADMIN_USERNAME: "",
      },
      () => {
        expect(() => new HarperREST({ verbose: false })).toThrow(
          "HDB_TARGET_URL required"
        );
        expect(
          () => new HarperREST({ baseUrl: "https://cluster.test" })
        ).toThrow("Harper admin credentials missing");
      }
    );
  });

  it("reads JSON, empty, and failing responses", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: "row" }]))
      .mockResolvedValueOnce(textResponse("", { status: 200 }))
      .mockResolvedValueOnce(textResponse("denied", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const rest = new HarperREST({
      baseUrl: "https://cluster.test///",
      password: "pw",
      user: "user",
      verbose: true,
    });

    await expect(rest.get("/Advisor/", { q: "Avery" })).resolves.toEqual([
      { id: "row" },
    ]);
    await expect(rest.get("/Advisor/empty")).resolves.toBeNull();
    await expect(rest.get("/Advisor/fail")).resolves.toBeNull();
    expect(rest.readCount).toBe(3);
    expect(fetchMock.mock.calls[0]?.[0]).toMatchObject({
      href: "https://cluster.test/Advisor/?q=Avery",
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("denied"));
  });

  it("writes public row fields and reports failures", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse("", { status: 201 }))
      .mockResolvedValueOnce(textResponse("bad write", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const rest = new HarperREST({
      baseUrl: "https://cluster.test",
      password: "pw",
      user: "user",
      verbose: false,
    });

    await expect(
      rest.put("Advisor", { id: "A B", name: "Avery", _private: true })
    ).resolves.toBe(true);
    await expect(rest.put("Advisor", { id: "bad" })).resolves.toBe(false);
    await expect(rest.put("Advisor", {})).rejects.toThrow("PUT requires id");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      id: "A B",
      name: "Avery",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://cluster.test/Advisor/A%20B"
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("bad write"));
    expect(rest.writeCount).toBe(2);
  });
});

describe("Harper auth and team helpers", () => {
  it("handles login, logout, current user, and failures", async () => {
    const login = new authResources.Login() as any;
    login.context = { login: vi.fn().mockResolvedValue(undefined) };
    await expect(
      login.post({ email: USER_EMAIL, password: "pw" })
    ).resolves.toEqual({ ok: true, username: USER_EMAIL });

    const usernameLogin = new authResources.Login() as any;
    usernameLogin.context = { login: vi.fn().mockResolvedValue(undefined) };
    await expect(
      usernameLogin.post("ignored", { username: "admin", password: "pw" })
    ).resolves.toEqual({ ok: true, username: "admin" });

    // Harper's thrown-error response writer reads `statusCode` (not
    // `status`), so both properties must ride on every thrown auth error.
    await expect(login.post({ email: "", password: "" })).rejects.toMatchObject(
      { status: 400, statusCode: 400 }
    );
    const rejected = new authResources.Login() as any;
    rejected.context = { login: vi.fn().mockRejectedValue(new Error("no")) };
    await expect(
      rejected.post({ email: USER_EMAIL, password: "bad" })
    ).rejects.toMatchObject({ status: 401, statusCode: 401 });

    const logout = new authResources.Logout() as any;
    logout.context = {
      session: {
        delete: vi.fn().mockResolvedValue(undefined),
        id: "session-a",
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    await expect(logout.post()).resolves.toEqual({ ok: true });

    const missingSession = new authResources.Logout() as any;
    missingSession.context = {};
    await expect(missingSession.post()).resolves.toEqual({ ok: true });

    // A session helper that exists but throws is a real logout failure —
    // the server-side session may survive — so it must not report ok.
    const failingLogout = new authResources.Logout() as any;
    failingLogout.context = {
      session: {
        delete: vi.fn().mockRejectedValue(new Error("delete refused")),
        id: "session-b",
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    await expect(failingLogout.post()).rejects.toMatchObject({
      status: 500,
      statusCode: 500,
    });

    const me = new authResources.Me() as any;
    me.user = { username: "admin", role: { role: "super" } };
    await expect(me.get()).resolves.toEqual({
      authenticated: true,
      role: "super",
      username: "admin",
    });
    me.user = null;
    await expect(me.get()).resolves.toEqual({ authenticated: false });
  });

  it("sorts current and past team members by role and date", () => {
    const groups = teamMemberGroups(
      {
        byAdvisor: new Map([
          ["a", { id: "a", firstName: "Avery", lastName: "Lead" }],
          ["b", { id: "b", legalName: "Blake Partner" }],
          ["c", { id: "c", displayName: "Casey Alum" }],
          ["d", { id: "d", legalName: "Devon Earlier" }],
          ["e", { id: "e", legalName: "Evan Other" }],
          ["f", { id: "f", legalName: "Finley Missing Role" }],
        ]),
        memberships: [
          {
            advisorId: "b",
            role: "partner",
            startDate: "2020-01-01",
            teamId: "team-a",
          },
          {
            advisorId: "a",
            role: "lead",
            startDate: "2022-01-01",
            teamId: "team-a",
          },
          {
            advisorId: "d",
            role: "partner",
            startDate: "2018-01-01",
            teamId: "team-a",
          },
          {
            advisorId: "e",
            role: "other",
            startDate: "2017-01-01",
            teamId: "team-a",
          },
          {
            advisorId: "f",
            startDate: "2016-01-01",
            teamId: "team-a",
          },
          {
            advisorId: "c",
            endDate: "2023-01-01",
            role: "unknown",
            startDate: "2019-01-01",
            teamId: "team-a",
          },
          {
            advisorId: "missing",
            role: "lead",
            startDate: "2018-01-01",
            teamId: "team-a",
          },
        ],
      },
      "team-a"
    );

    expect(groups.currentMembers.map((row: any) => row.advisor.id)).toEqual([
      "a",
      "d",
      "b",
      "f",
      "e",
    ]);
    expect(groups.pastMembers).toEqual([
      expect.objectContaining({ advisor: { id: "c", name: "Casey Alum" } }),
    ]);
  });
});

describe("BrokerCheck client", () => {
  it("builds search URLs and parses successful responses", async () => {
    const calls: Array<[string, Readonly<Record<string, string | number>>]> =
      [];
    const client = new BrokerCheckClient({
      verbose: false,
    });
    vi.spyOn(client, "get").mockImplementation(async (path, params) => {
      calls.push([path, params]);
      return { ok: true, path, params };
    });

    await expect(
      client.searchIndividual("Avery", "GA", 2, 5)
    ).resolves.toMatchObject({ ok: true, path: SEARCH_INDIVIDUAL_PATH });
    await client.searchFirm("Example", 1, 3);
    await client.getIndividual("123");
    await client.getFirm("456");
    await client.firmRoster("789", 1, 10);

    expect(calls[0]).toEqual([
      SEARCH_INDIVIDUAL_PATH,
      expect.objectContaining({ query: "Avery", state: "GA", start: 10 }),
    ]);
    expect(calls[1]).toEqual([
      "/search/firm",
      expect.objectContaining({ query: "Example", start: 3 }),
    ]);
    expect(calls[2]).toEqual(["/search/individual/123", { wt: "json" }]);
    expect(calls[3]).toEqual(["/search/firm/456", { wt: "json" }]);
    expect(calls[4]).toEqual([
      SEARCH_INDIVIDUAL_PATH,
      expect.objectContaining({ firm: "789", start: 10 }),
    ]);
  });

  it("handles response failures, retries, and block detection", async () => {
    vi.useFakeTimers();
    const client = new BrokerCheckClient({ verbose: false });

    await expect(
      client.parseResponse(
        "https://bc.test/404",
        textResponse("{}", { status: 404 }),
        "{}"
      )
    ).rejects.toThrow("404");
    await expect(
      client.parseResponse(
        "https://bc.test/500",
        textResponse("nope", { status: 500 }),
        "nope"
      )
    ).rejects.toThrow("HTTP 500");
    await expect(
      client.parseResponse(
        "https://bc.test/bad-json",
        textResponse("ok"),
        "not-json"
      )
    ).rejects.toThrow();

    const rateLimit = expect(
      client.parseResponse(
        "https://bc.test/429",
        textResponse("slow", { status: 429 }),
        "slow"
      )
    ).rejects.toThrow("HTTP 429");
    await vi.advanceTimersByTimeAsync(60_000);
    await rateLimit;
    expect(client.consecutiveRateLimits).toBe(1);

    Object.assign(client.state, { consecutiveRateLimits: 4 });
    await expect(client.handleRateLimit(403)).rejects.toBeInstanceOf(
      BrokerCheckBlocked
    );
  });

  it("fetches JSON with headers, abort control, and retry exhaustion", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const client = new BrokerCheckClient({
      jitter: 0,
      rateSeconds: 0,
      timeoutMs: 100,
      ua: "test-agent",
      verbose: false,
    });
    const retryClient = new BrokerCheckClient({ verbose: false });
    vi.spyOn(retryClient, "getOnce")
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ ok: true });

    await expect(client.fetchJson("https://bc.test/json")).resolves.toEqual({
      ok: true,
    });
    await expect(
      retryClient.getWithRetries("https://bc.test/retry", [0, 0])
    ).resolves.toEqual({ ok: true });
    await expect(
      client.getWithRetries("https://bc.test/exhausted", [])
    ).rejects.toThrow("exhausted retries");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { "User-Agent": "test-agent", Accept: "application/json" },
    });
  });

  it("surfaces blocked retry errors without retrying them", async () => {
    const client = new BrokerCheckClient({ verbose: false });
    vi.spyOn(client, "getOnce").mockRejectedValue(
      new BrokerCheckBlocked("blocked")
    );

    await expect(
      client.getWithRetries("https://bc.test/blocked", [0, 0])
    ).rejects.toBeInstanceOf(BrokerCheckBlocked);
  });

  it("unwraps content envelopes and returns null for empty hits", () => {
    const content = { id: "content-row" };
    const envelope = {
      hits: {
        hits: [{ _source: { content: JSON.stringify(content) } }],
      },
    };

    expect(unwrapIndividual(envelope)).toEqual(content);
    expect(unwrapFirm({ hits: { hits: [] } })).toBeNull();
    expect(unwrapFirm({})).toBeNull();
  });
});

describe("Harper transport helpers", () => {
  it("builds config from local and hosted environments", async () => {
    await withEnv(
      {
        HDB_ADMIN_PASSWORD: "",
        HDB_ADMIN_USERNAME: "",
        HDB_ROOT: "/tmp/hdb",
        HDB_TARGET_URL: "",
        HARPER_CLUSTER_URL: "",
        HOME: "/home/example",
      },
      () => {
        expect(harperConfig()).toMatchObject({
          socket: "/tmp/hdb/operations-server",
          target: "",
        });
        expect(describeTarget()).toBe("unix-socket /tmp/hdb/operations-server");
      }
    );

    await withEnv(
      {
        HDB_ADMIN_PASSWORD: "pw",
        HDB_ADMIN_USERNAME: "user",
        HDB_TARGET_URL: "https://cluster.example///",
      },
      () => {
        expect(harperConfig()).toMatchObject({
          target: CLUSTER_EXAMPLE_HOST,
          auth: "dXNlcjpwdw==",
        });
        expect(describeTarget()).toBe("HTTPS https://cluster.example");
      }
    );
  });

  it("posts operations over hosted fetch and falls back to REST upsert", async () => {
    await withEnv(
      {
        HDB_ADMIN_PASSWORD: "pw",
        HDB_ADMIN_USERNAME: "user",
        HDB_TARGET_URL: CLUSTER_EXAMPLE_HOST,
      },
      async () => {
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(jsonResponse([{ id: "sql-row" }]))
          .mockResolvedValueOnce(textResponse("missing op", { status: 404 }))
          .mockResolvedValueOnce(textResponse("", { status: 201 }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(
          op({ operation: "sql", sql: "select 1" })
        ).resolves.toEqual([{ id: "sql-row" }]);
        await expect(upsert("Firm", [{ id: "firm-a" }])).resolves.toBe(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe("https://cluster.example/");
        expect(fetchMock.mock.calls[2]?.[0]).toBe(
          "https://cluster.example/Firm/firm-a"
        );
      }
    );
  });

  it("surfaces hosted operation and REST fallback failures", async () => {
    await withEnv(
      {
        HDB_ADMIN_PASSWORD: "pw",
        HDB_ADMIN_USERNAME: "user",
        HDB_TARGET_URL: CLUSTER_EXAMPLE_HOST,
      },
      async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(textResponse("denied", { status: 500 }))
            )
        );

        await expect(op({ operation: "sql", sql: "select 1" })).rejects.toThrow(
          "HTTP 500"
        );
        await expect(upsert("Firm", [{ id: "firm-a" }])).rejects.toThrow(
          "HTTP 500"
        );
        await expect(upsert("Firm", [])).resolves.toBe(0);
      }
    );
  });
});
