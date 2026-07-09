import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeTarget,
  harperConfig,
  op,
  sql,
  upsert,
} from "../src/lib/harper.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const TARGET_URL = "https://cluster.example.com";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "secret";
const MISSING_OPERATION = "missing operation";

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

  it("posts operations through the configured local socket", async () => {
    const hdbRoot = await mkdtemp(join(tmpdir(), "advisorbook-harper-"));
    const socketPath = join(hdbRoot, "operations-server");
    const receivedBodies: string[] = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", chunk => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        receivedBodies.push(Buffer.concat(chunks).toString("utf8"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    try {
      await new Promise<void>((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(socketPath, resolveListen);
      });
      process.env.HDB_TARGET_URL = "";
      process.env.HDB_ADMIN_USERNAME = ADMIN_USERNAME;
      process.env.HDB_ADMIN_PASSWORD = ADMIN_PASSWORD;
      process.env.HDB_ROOT = hdbRoot;

      await expect(op({ operation: "status" })).resolves.toEqual({ ok: true });
      expect(receivedBodies).toEqual([JSON.stringify({ operation: "status" })]);
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close(error => (error ? rejectClose(error) : resolveClose()));
      });
      await rm(hdbRoot, { force: true, recursive: true });
    }
  });

  it("falls back to REST upsert when hosted operations upsert is unavailable", async () => {
    process.env.HDB_TARGET_URL = TARGET_URL;
    process.env.HDB_ADMIN_USERNAME = ADMIN_USERNAME;
    process.env.HDB_ADMIN_PASSWORD = ADMIN_PASSWORD;
    const fetchMock = vi.fn(async () =>
      fetchMock.mock.calls.length === 1
        ? new Response(MISSING_OPERATION, { status: 404 })
        : new Response("", { status: 201 })
    );
    globalThis.fetch = fetchMock;

    await expect(upsert("Firm", [{ id: "firm-1" }])).resolves.toBe(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${TARGET_URL}/Firm/firm-1`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ id: "firm-1" }),
      })
    );
  });

  it("surfaces hosted operation errors that are not REST fallbacks", async () => {
    process.env.HDB_TARGET_URL = TARGET_URL;
    process.env.HDB_ADMIN_USERNAME = ADMIN_USERNAME;
    process.env.HDB_ADMIN_PASSWORD = ADMIN_PASSWORD;
    globalThis.fetch = vi.fn(
      async () => new Response("not ready", { status: 503 })
    );

    await expect(op({ operation: "restart" })).rejects.toThrow(
      "Harper restart -> HTTP 503"
    );
  });

  it("returns an empty array when SQL response is empty", async () => {
    process.env.HDB_TARGET_URL = TARGET_URL;
    process.env.HDB_ADMIN_USERNAME = ADMIN_USERNAME;
    process.env.HDB_ADMIN_PASSWORD = ADMIN_PASSWORD;
    globalThis.fetch = vi.fn(async () => new Response("", { status: 200 }));

    await expect(sql("select * from data.Firm")).resolves.toEqual([]);
  });

  it("requires ids before falling back to REST upsert", async () => {
    process.env.HDB_TARGET_URL = TARGET_URL;
    process.env.HDB_ADMIN_USERNAME = ADMIN_USERNAME;
    process.env.HDB_ADMIN_PASSWORD = ADMIN_PASSWORD;
    globalThis.fetch = vi.fn(
      async () => new Response(MISSING_OPERATION, { status: 404 })
    );

    await expect(upsert("Firm", [{ name: "No id" }])).rejects.toThrow(
      "record missing id for REST upsert into Firm"
    );
  });

  it("surfaces REST upsert failures after hosted operation fallback", async () => {
    process.env.HDB_TARGET_URL = TARGET_URL;
    process.env.HDB_ADMIN_USERNAME = ADMIN_USERNAME;
    process.env.HDB_ADMIN_PASSWORD = ADMIN_PASSWORD;
    const fetchMock = vi.fn(async () =>
      fetchMock.mock.calls.length === 1
        ? new Response(MISSING_OPERATION, { status: 404 })
        : new Response("bad row", { status: 400 })
    );
    globalThis.fetch = fetchMock;

    await expect(upsert("Firm", [{ id: "firm-1" }])).rejects.toThrow(
      "Harper REST upsert Firm/firm-1 -> HTTP 400"
    );
  });
});
