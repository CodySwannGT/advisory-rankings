import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("brokercheck crawl orchestrator", () => {
  it("uses side-effect-free state helpers", () => {
    const source = readFileSync("src/scripts/brokercheck_crawl_all.ts", "utf8");

    expect(source).toContain("./fetch_brokercheck_core.js");
    expect(source).not.toContain("./fetch_brokercheck.js");
  });

  it("keeps the CLI entrypoint on the shared fetch core", () => {
    const source = readFileSync("src/scripts/fetch_brokercheck.ts", "utf8");

    expect(source).toContain("./fetch_brokercheck_core.js");
    expect(source).toContain("loadState");
    expect(source).toContain("saveState");
    expect(source).not.toContain("const STATE_FILE");
  });

  it("resolves deployed Harper credentials for scheduled runs", () => {
    const source = readFileSync("src/scripts/brokercheck_crawl_all.ts", "utf8");

    expect(source).toContain("loadCreds");
    expect(source).toContain("process.env.HDB_TARGET_URL ?? creds.clusterUrl");
    expect(source).toContain("process.env.HDB_ADMIN_USERNAME");
  });
});
