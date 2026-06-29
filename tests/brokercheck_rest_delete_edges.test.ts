import { afterEach, describe, expect, it, vi } from "vitest";

import { HarperREST } from "../src/lib/brokercheck-rest.js";

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

  it("treats missing rows and successful deletes as complete", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 204 })
      .mockResolvedValueOnce({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const rest = new HarperREST({
      baseUrl: "https://harper.example.test/",
      user: "admin",
      password: "secret",
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
      baseUrl: "https://harper.example.test",
      user: "admin",
      password: "secret",
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
