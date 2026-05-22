import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { harperConfig } from "../src/lib/harper.js";

describe("harperConfig", () => {
  it("uses the Fabric cluster default and Harper credentials when HDB env vars are not set", () => {
    const config = harperConfig({
      HOME: "/Users/cody/.advisory-rankings-test",
      HARPER_CLUSTER_URL: "https://example.harperfabric.com/",
      HARPER_ADMIN_USERNAME: "fabric-user",
      HARPER_ADMIN_PASSWORD: "fabric-password",
    });

    expect(config.target).toBe("https://example.harperfabric.com:9925");
    expect(config.auth).toBe(
      Buffer.from("fabric-user:fabric-password").toString("base64")
    );
  });

  it("lets explicit HDB env vars override the Fabric defaults", () => {
    const config = harperConfig({
      HOME: "/Users/cody/.advisory-rankings-test",
      HDB_TARGET_URL: "http://127.0.0.1:9925/",
      HDB_ADMIN_USERNAME: "hdb-user",
      HDB_ADMIN_PASSWORD: "hdb-password",
      HARPER_CLUSTER_URL: "https://example.harperfabric.com/",
      HARPER_ADMIN_USERNAME: "fabric-user",
      HARPER_ADMIN_PASSWORD: "fabric-password",
    });

    expect(config.target).toBe("http://127.0.0.1:9925");
    expect(config.auth).toBe(
      Buffer.from("hdb-user:hdb-password").toString("base64")
    );
  });
});
