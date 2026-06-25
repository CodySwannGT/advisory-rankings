import { afterEach, describe, expect, it, vi } from "vitest";
import { describeTarget, harperConfig, op, upsert } from "../src/lib/harper.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const TARGET_URL = "https://cluster.example.com";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "secret";

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("Harper client edge behavior", () => {
  it("preserves explicit operation ports and trims trailing slashes", () => {
    expect(
      harperConfig({
        HDB_TARGET_URL: `${TARGET_URL}:9443///`,
        HDB_ADMIN_USERNAME: ADMIN_USERNAME,
        HDB_ADMIN_PASSWORD: ADMIN_PASSWORD,
        HDB_ROOT: "/tmp/hdb",
      }).target
    ).toBe("https://cluster.example.com:9443");
  });

  it("describes local socket mode when target is explicitly empty", () => {
    process.env.HDB_TARGET_URL = "";
    process.env.HDB_ADMIN_USERNAME = ADMIN_USERNAME;
    process.env.HDB_ADMIN_PASSWORD = ADMIN_PASSWORD;
    process.env.HDB_ROOT = "/tmp/hdb";

    expect(describeTarget()).toBe("unix-socket /tmp/hdb/operations-server");
  });

  it("parses empty operation responses as null", async () => {
    process.env.HDB_TARGET_URL = TARGET_URL;
    process.env.HDB_ADMIN_USERNAME = ADMIN_USERNAME;
    process.env.HDB_ADMIN_PASSWORD = ADMIN_PASSWORD;
    globalThis.fetch = vi.fn(async () => new Response("", { status: 200 }));

    await expect(op({ operation: "ping" })).resolves.toBeNull();
  });

  it("returns zero when operations upsert omits hashes", async () => {
    process.env.HDB_TARGET_URL = TARGET_URL;
    process.env.HDB_ADMIN_USERNAME = ADMIN_USERNAME;
    process.env.HDB_ADMIN_PASSWORD = ADMIN_PASSWORD;
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 }));

    await expect(upsert("Firm", [{ id: "firm-1" }])).resolves.toBe(0);
  });

  it("requires ids before falling back to REST upsert", async () => {
    process.env.HDB_TARGET_URL = TARGET_URL;
    process.env.HDB_ADMIN_USERNAME = ADMIN_USERNAME;
    process.env.HDB_ADMIN_PASSWORD = ADMIN_PASSWORD;
    globalThis.fetch = vi.fn(
      async () => new Response("missing operation", { status: 404 })
    );

    await expect(upsert("Firm", [{ name: "No id" }])).rejects.toThrow(
      "record missing id for REST upsert into Firm"
    );
  });
});
