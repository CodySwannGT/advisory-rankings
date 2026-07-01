import { afterEach, describe, expect, it, vi } from "vitest";
import { articleDates } from "../src/lib/article-dates.js";
import {
  BrokerCheckBlocked,
  BrokerCheckClient,
  unwrapFirm,
  unwrapIndividual,
} from "../src/lib/brokercheck.js";
import { HarperREST } from "../src/lib/brokercheck-rest.js";
import {
  parseRaymondJamesBranch,
  parseRaymondJamesBranchMarkdown,
} from "../src/lib/raymond-james-markdown.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const FALLBACK_NOW = new Date("2024-01-02T03:04:05.000Z");

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("library branch edge coverage", () => {
  it("normalizes article dates across fallback field types", () => {
    expect(
      articleDates(
        {
          publishedDate: " ",
          date: Number.NaN,
          modifiedDate: new Date("2024-04-05T06:07:08.000Z"),
          modified: "2024-04-06T00:00:00.000Z",
        },
        FALLBACK_NOW
      )
    ).toEqual({ publishedDate: "2024-04-05" });

    expect(
      articleDates(
        { publishedDate: "bad date", fetchedAt: "2024-03-02" },
        FALLBACK_NOW
      )
    ).toEqual({ publishedDate: "2024-03-02" });

    expect(
      articleDates(
        { publishedDate: {}, modifiedDate: "2024-02-03T04:05:06.000Z" },
        FALLBACK_NOW
      )
    ).toEqual({ publishedDate: "2024-02-03" });
  });

  it("parses sparse Raymond James branch metadata with safe defaults", () => {
    expect(
      parseRaymondJamesBranch("No branch header", "/branches/plain")
    ).toEqual({
      name: "Raymond James Branch",
      branchUrl: "/branches/plain",
      address: undefined,
      city: undefined,
      state: undefined,
      postalCode: undefined,
      phone: undefined,
    });
  });

  it("parses Raymond James advisor links and branch address variants", () => {
    const markdown = [
      "# San Francisco of Raymond James",
      "* Raymond James Financial 555 Market St San Francisco, CA 94105 [T: (415) 555-0101]",
      "",
      "[![Image 1: Jane Advisor](/headshots/jane.jpg) Jane Advisor Jane Advisor CFP® View Website](/jane-advisor)",
      "",
      "[](mailto:jane@example.com)[](tel:+14155550102)",
      "",
      "[![Image 2](/headshots/john.jpg) John Manager Branch Manager View Website](https://example.com/john)",
      "",
      "",
    ].join("\n");

    expect(parseRaymondJamesBranch(markdown, "/branches/sf")).toMatchObject({
      name: "San Francisco",
      address: "555 Market St",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      phone: "4155550101",
    });
    expect(parseRaymondJamesBranchMarkdown(markdown, "/branches/sf")).toEqual([
      expect.objectContaining({
        advisorName: "Jane Advisor Jane Advisor, CFP®",
        roleTitle: undefined,
        advisorUrl: "https://www.raymondjames.com/jane-advisor",
        headshotUrl: "https://www.raymondjames.com/headshots/jane.jpg",
        businessEmail: "jane@example.com",
        businessPhone: "14155550102",
      }),
      expect.objectContaining({
        advisorName: "John Manager",
        roleTitle: "Branch Manager",
        advisorUrl: "https://example.com/john",
        businessEmail: undefined,
        businessPhone: undefined,
      }),
    ]);
  });

  it("validates Harper REST constructor inputs and quoted credentials", () => {
    expect(() => new HarperREST()).toThrow(
      "HDB_TARGET_URL required for Harper REST writes"
    );

    process.env.HDB_TARGET_URL = "https://cluster.example.com///";
    expect(() => new HarperREST()).toThrow("Harper admin credentials missing");

    process.env.HDB_ADMIN_USERNAME = '"admin"';
    process.env.HDB_ADMIN_PASSWORD = "'secret'";
    const rest = new HarperREST({ verbose: false, timeoutMs: 25 });
    expect(rest.base).toBe("https://cluster.example.com");
    expect(rest.auth).toBe("Basic YWRtaW46c2VjcmV0");
    expect(rest.timeoutMs).toBe(25);
    expect(rest.verbose).toBe(false);
  });

  it("handles Harper REST reads and write edge responses", async () => {
    const rest = new HarperREST({
      baseUrl: "https://cluster.example.com/",
      user: "admin",
      password: "secret",
      verbose: false,
    });
    const fetchMock = vi.fn(async () => {
      const call = fetchMock.mock.calls.length;
      if (call === 1) return new Response("", { status: 200 });
      if (call === 2) return new Response("nope", { status: 500 });
      if (call === 3) return new Response(null, { status: 204 });
      return new Response(null, { status: 404 });
    });
    globalThis.fetch = fetchMock;

    await expect(rest.get("/Firm", { limit: 1 })).resolves.toBeNull();
    await expect(rest.get("/Firm/bad")).resolves.toBeNull();
    await expect(
      rest.put("Firm", { id: "firm-1", name: "Firm", _source: "private" })
    ).resolves.toBe(true);
    await expect(rest.delete("Firm", "missing")).resolves.toBe(true);
    expect(rest.readCount).toBe(2);
    expect(rest.writeCount).toBe(2);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ id: "firm-1", name: "Firm" }),
    });
  });

  it("handles Harper REST PUT validation and delete failures", async () => {
    const rest = new HarperREST({
      baseUrl: "https://cluster.example.com",
      user: "admin",
      password: "secret",
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => new Response("bad", { status: 500 }));
    globalThis.fetch = fetchMock;

    await expect(rest.put("Firm", {})).rejects.toThrow("PUT requires id");
    await expect(rest.put("Firm", { id: "firm-1" })).resolves.toBe(false);
    await expect(rest.delete("Firm", "firm-1")).resolves.toBe(false);
  });

  it("uses BrokerCheck env rate overrides and assembles search URLs", async () => {
    process.env.BC_RATE_SECONDS = "3.25";
    const client = new BrokerCheckClient({
      rateSeconds: 1,
      jitter: 0,
      timeoutMs: 50,
      ua: "tests",
      verbose: false,
    });
    const retrySpy = vi
      .spyOn(client, "getWithRetries")
      .mockResolvedValue({ ok: true });

    await expect(
      client.searchIndividual("Jane Advisor", "CA", 2, 10)
    ).resolves.toEqual({ ok: true });
    await client.searchFirm("Firm", 1, 5);
    await client.getIndividual("123");
    await client.getFirm("456");
    await client.firmRoster("789", 3, 25);

    expect(client.rateSeconds).toBe(3.25);
    expect(retrySpy.mock.calls.map(call => call[0])).toEqual([
      "https://api.brokercheck.finra.org/search/individual?query=Jane+Advisor&state=CA&hl=true&nrows=10&start=20&r=25&sort=score%2Bdesc&wt=json",
      "https://api.brokercheck.finra.org/search/firm?query=Firm&hl=true&nrows=5&start=5&r=25&sort=score%2Bdesc&wt=json",
      "https://api.brokercheck.finra.org/search/individual/123?wt=json",
      "https://api.brokercheck.finra.org/search/firm/456?wt=json",
      "https://api.brokercheck.finra.org/search/individual?query=&firm=789&hl=false&nrows=25&start=75&r=25&wt=json",
    ]);
  });

  it("parses BrokerCheck responses and retry terminal errors", async () => {
    const client = new BrokerCheckClient({ verbose: false });

    await expect(
      client.getWithRetries("https://api.example.test", [])
    ).rejects.toThrow("exhausted retries for https://api.example.test");
    await expect(
      client.parseResponse(
        "https://api.example.test/not-found",
        new Response("missing", { status: 404 }),
        "missing"
      )
    ).rejects.toThrow("404 for https://api.example.test/not-found");
    await expect(
      client.parseResponse(
        "https://api.example.test/error",
        new Response("bad", { status: 500 }),
        "bad"
      )
    ).rejects.toThrow("HTTP 500: bad");
    await expect(
      client.parseResponse(
        "https://api.example.test/ok",
        new Response('{"ok":true}', { status: 200 }),
        '{"ok":true}'
      )
    ).resolves.toEqual({ ok: true });
  });

  it("handles BrokerCheck direct fetch and rate-limit stop branches", async () => {
    const client = new BrokerCheckClient({
      timeoutMs: 50,
      ua: "tests",
      verbose: false,
    });
    globalThis.fetch = vi.fn(
      async () => new Response('{"value":1}', { status: 200 })
    );

    await expect(
      client.fetchJson("https://api.example.test/ok")
    ).resolves.toEqual({
      value: 1,
    });

    Object.assign(client.state, { consecutiveRateLimits: 4 });
    await expect(client.handleRateLimit(429)).rejects.toBeInstanceOf(
      BrokerCheckBlocked
    );
  });

  it("unwraps BrokerCheck content envelopes defensively", () => {
    expect(unwrapIndividual({})).toBeNull();
    expect(
      unwrapIndividual({
        hits: { hits: [{ _source: { content: '{"crd":"123"}' } }] },
      })
    ).toEqual({ crd: "123" });
    expect(
      unwrapFirm({
        hits: { hits: [{ _source: { content: "" } }] },
      })
    ).toBeNull();
  });
});
