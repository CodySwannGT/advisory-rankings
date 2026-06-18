import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("brokercheck crawl orchestrator", () => {
  it("uses side-effect-free state helpers", () => {
    const source = readFileSync("src/scripts/brokercheck_crawl_all.ts", "utf8");

    expect(source).toContain("./fetch_brokercheck_core.js");
    expect(source).not.toContain("./fetch_brokercheck.js");
  });

  it("resolves deployed Harper credentials for scheduled runs", () => {
    const source = readFileSync("src/scripts/brokercheck_crawl_all.ts", "utf8");

    expect(source).toContain("loadCreds");
    expect(source).toContain("process.env.HDB_TARGET_URL ?? creds.clusterUrl");
    expect(source).toContain("process.env.HDB_ADMIN_USERNAME");
  });
});
