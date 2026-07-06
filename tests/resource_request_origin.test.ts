import { beforeAll, describe, expect, it } from "vitest";

let requireSameOrigin: (context: unknown) => void;

beforeAll(async () => {
  Object.assign(globalThis, { Resource: class {}, tables: {} });
  ({ requireSameOrigin } =
    await import("../src/harper/resource-request-origin.js"));
});

/**
 * Builds a Harper-context stand-in exposing a header bag.
 * @param headers Header record to expose.
 * @returns Context-like object with a `headers` field.
 */
function contextWith(
  headers: Readonly<Record<string, string>>
): Readonly<Record<string, unknown>> {
  return { headers };
}

describe("requireSameOrigin", () => {
  const appHost = "advisory-rankings-de.example.com";

  it("allows requests with no Origin and no Referer (non-browser clients)", () => {
    expect(() =>
      requireSameOrigin(contextWith({ host: appHost }))
    ).not.toThrow();
  });

  it("allows a same-origin Origin header", () => {
    expect(() =>
      requireSameOrigin(
        contextWith({ host: appHost, origin: `https://${appHost}` })
      )
    ).not.toThrow();
  });

  it("matches the forwarded host behind the Fabric edge proxy", () => {
    expect(() =>
      requireSameOrigin(
        contextWith({
          host: "internal-node.local",
          "x-forwarded-host": appHost,
          origin: `https://${appHost}`,
        })
      )
    ).not.toThrow();
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(() =>
      requireSameOrigin(
        contextWith({ host: appHost, referer: `https://${appHost}/firms` })
      )
    ).not.toThrow();
  });

  it("rejects a cross-origin Origin with a 403", () => {
    expect(() =>
      requireSameOrigin(
        contextWith({ host: appHost, origin: "https://evil.example" })
      )
    ).toThrow(expect.objectContaining({ status: 403, statusCode: 403 }));
  });

  it("rejects a cross-origin Referer with a 403", () => {
    expect(() =>
      requireSameOrigin(
        contextWith({ host: appHost, referer: "https://evil.example/x" })
      )
    ).toThrow(expect.objectContaining({ status: 403, statusCode: 403 }));
  });

  it("rejects a present but unparseable source origin (fail closed)", () => {
    expect(() =>
      requireSameOrigin(contextWith({ host: appHost, origin: "garbage" }))
    ).toThrow(expect.objectContaining({ status: 403, statusCode: 403 }));
  });
});
