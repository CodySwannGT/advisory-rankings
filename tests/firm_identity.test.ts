import { describe, expect, it } from "vitest";
import {
  canonicalFirmId,
  canonicalFirmName,
  curatedFirmAliasRows,
  normalizeFirmAlias,
  resolveFirmIdentity,
} from "../src/lib/firm-identity.js";

describe("firm identity", () => {
  it("resolves Morgan Stanley Wealth Management to Morgan Stanley", () => {
    const canonicalName = "Morgan Stanley";
    const aliasName = "Morgan Stanley Wealth Management";
    const identity = resolveFirmIdentity(aliasName);

    expect(identity).toMatchObject({
      canonicalName,
      canonicalId: canonicalFirmId(canonicalName),
      matchedAlias: aliasName,
    });
    expect(canonicalFirmName(aliasName)).toBe(canonicalName);
    expect(normalizeFirmAlias(`${aliasName}, LLC`)).toBe(
      "morgan stanley wealth management"
    );
  });

  it("emits approved alias rows for seeded and imported data", () => {
    const canonicalName = "Morgan Stanley";
    const aliasName = "Morgan Stanley Wealth Management";
    expect(curatedFirmAliasRows()).toContainEqual(
      expect.objectContaining({
        firmId: canonicalFirmId(canonicalName),
        alias: aliasName,
        normalizedAlias: "morgan stanley wealth management",
        confidence: "approved",
      })
    );
  });
});
