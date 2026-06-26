import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { harperConfig } from "../src/lib/harper.js";

const FABRIC_PASSWORD = "fabric-pass";
const FABRIC_USER = "fabric-user";
const HDB_HOME = "/tmp/hdb-home";

function decodedAuth(auth: string): string {
  return Buffer.from(auth, "base64").toString("utf8");
}

describe("harperConfig edge cases", () => {
  it("derives the default operations port from Fabric cluster credentials", () => {
    const config = harperConfig({
      HOME: HDB_HOME,
      HARPER_CLUSTER_URL: "https://cluster.example",
      HARPER_ADMIN_USERNAME: FABRIC_USER,
      HARPER_ADMIN_PASSWORD: FABRIC_PASSWORD,
    });

    expect(config.target).toBe("https://cluster.example:9925");
    expect(config.socket).toBe("/tmp/hdb-home/.harperdb/operations-server");
    expect(decodedAuth(config.auth)).toBe(`${FABRIC_USER}:${FABRIC_PASSWORD}`);
  });

  it("preserves explicit cluster ports and trims trailing slashes", () => {
    const config = harperConfig({
      HOME: HDB_HOME,
      HARPER_CLUSTER_URL: "https://cluster.example:9443///",
      HARPER_ADMIN_USERNAME: FABRIC_USER,
      HARPER_ADMIN_PASSWORD: FABRIC_PASSWORD,
    });

    expect(config.target).toBe("https://cluster.example:9443");
  });

  it("keeps invalid cluster URLs as provided after slash trimming", () => {
    const config = harperConfig({
      HOME: HDB_HOME,
      HARPER_CLUSTER_URL: "cluster-without-protocol///",
      HARPER_ADMIN_USERNAME: FABRIC_USER,
      HARPER_ADMIN_PASSWORD: FABRIC_PASSWORD,
    });

    expect(config.target).toBe("cluster-without-protocol");
  });

  it("treats empty HDB environment values as explicit local-mode settings", () => {
    const config = harperConfig({
      HDB_ADMIN_PASSWORD: "",
      HDB_ADMIN_USERNAME: "",
      HDB_ROOT: "/tmp/hdb-root",
      HDB_TARGET_URL: "",
      HOME: HDB_HOME,
    });

    expect(config.target).toBe("");
    expect(config.socket).toBe("/tmp/hdb-root/operations-server");
    expect(decodedAuth(config.auth)).toBe(":");
  });
});
