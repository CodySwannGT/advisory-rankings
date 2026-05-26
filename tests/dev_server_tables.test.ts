import { describe, expect, it } from "vitest";

import { RESOURCE_TABLE_NAMES } from "../src/harper/resource-data.js";
import { DEV_SERVER_TABLES } from "../src/scripts/dev_server_tables.js";

const byName = (left: string, right: string) => left.localeCompare(right);

describe("dev server table allowlist", () => {
  it("includes every table consumed by public resource data", () => {
    expect([...DEV_SERVER_TABLES].sort(byName)).toEqual(
      expect.arrayContaining([...RESOURCE_TABLE_NAMES].sort(byName))
    );
  });
});
