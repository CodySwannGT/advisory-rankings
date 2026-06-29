import { afterEach, describe, expect, it, vi } from "vitest";

import { HarperREST } from "../src/lib/brokercheck-rest.js";

const BASE_URL = "https://harper.example.test";
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "secret";

describe("Harper REST delete edges", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("builds defaults from environment credentials", () => {
    vi.stubEnv("HDB_TARGET_URL", "https://env.harper.example.test///");
    vi.stubEnv("HDB_ADMIN_USERNAME", '"env-admin"');
    vi.stubEnv("HDB_ADMIN_PASSWORD", "'env-secret'");

    const rest = new HarperREST({ verbose: false });

    expect(rest.base).toBe("https://env.harper.example.test");
    expect(rest.auth).toBe(
      `Basic ${Buffer.from("env-admin:env-secret").toString("base64")}`
    );
    expect(rest.timeoutMs).toBe(30_000);
    expect(rest.verbose).toBe(false);
  });

  it("reads JSON, empty, and failed GET responses", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '{"items":[{"id":"row-1"}]}',
      })
      .mockResolvedValueOnce({ ok: true, text: async () => "   " })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "service unavailable",
      });
    vi.stubGlobal("fetch", fetchMock);

    const rest = new HarperREST({
      baseUrl: BASE_URL,
      user: ADMIN_USER,
      password: ADMIN_PASSWORD,
      verbose: true,
    });

    await expect(rest.get("/Advisor", { q: "Jane Doe" })).resolves.toEqual({
      items: [{ id: "row-1" }],
    });
    await expect(rest.get("/Advisor")).resolves.toBeNull();
    await expect(rest.get("/Advisor")).resolves.toBeNull();
    expect(rest.readCount).toBe(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${BASE_URL}/Advisor?q=Jane+Doe`
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "  ! GET /Advisor -> 503: service unavailable"
    );
    errorSpy.mockRestore();
  });

  it("writes filtered PUT payloads and reports failures", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 201 })
      .mockResolvedValueOnce({
        status: 400,
        text: async () => "bad payload",
      });
    vi.stubGlobal("fetch", fetchMock);

    const rest = new HarperREST({
      baseUrl: BASE_URL,
      user: ADMIN_USER,
      password: ADMIN_PASSWORD,
      verbose: false,
    });

    await expect(
      rest.put("Advisor", { id: "advisor 1", name: "Jane", _source: "load" })
    ).resolves.toBe(true);
    await expect(rest.put("Advisor", { id: "advisor-2" })).resolves.toBe(false);
    const firstRequestInit = fetchMock.mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    expect(JSON.parse(String(firstRequestInit?.body))).toEqual({
      id: "advisor 1",
      name: "Jane",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "  ! PUT /Advisor/advisor-2 -> 400: bad payload"
    );
    await expect(rest.put("Advisor", {})).rejects.toThrow("PUT requires id");
    errorSpy.mockRestore();
  });

  it("treats missing rows and successful deletes as complete", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 204 })
      .mockResolvedValueOnce({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const rest = new HarperREST({
      baseUrl: `${BASE_URL}/`,
      user: ADMIN_USER,
      password: ADMIN_PASSWORD,
      verbose: false,
    });

    await expect(rest.delete("AdvisorSearchIndex", "token 1")).resolves.toBe(
      true
    );
    await expect(rest.delete("AdvisorSearchIndex", "token 2")).resolves.toBe(
      true
    );
    await expect(rest.delete("AdvisorSearchIndex", "token 3")).resolves.toBe(
      true
    );

    expect(rest.writeCount).toBe(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://harper.example.test/AdvisorSearchIndex/token%201"
    );
  });

  it("returns false and logs failed delete responses", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 500,
        text: async () => "delete failed",
      })
    );

    const rest = new HarperREST({
      baseUrl: BASE_URL,
      user: ADMIN_USER,
      password: ADMIN_PASSWORD,
      verbose: false,
    });

    await expect(rest.delete("AdvisorSearchIndex", "token-1")).resolves.toBe(
      false
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "  ! DELETE /AdvisorSearchIndex/token-1 -> 500: delete failed"
    );
    errorSpy.mockRestore();
  });
});
