import { describe, expect, it } from "vitest";
import { canonicalizeFirmResourceRows } from "../src/harper/resource-firm-canonicalization.js";
import { canonicalFirmId } from "../src/lib/firm-identity.js";
import { firmId, uid } from "../src/lib/ids.js";

const MORGAN_STANLEY = "Morgan Stanley";
const MORGAN_STANLEY_WEALTH_MANAGEMENT = "Morgan Stanley Wealth Management";

describe("public resource firm canonicalization", () => {
  it("renders stale alias-only data as the canonical Morgan Stanley firm", () => {
    const aliasId = firmId(MORGAN_STANLEY_WEALTH_MANAGEMENT);
    const canonicalId = canonicalFirmId(MORGAN_STANLEY_WEALTH_MANAGEMENT);
    const mentionId = uid("resource:firm:mention");
    const rows = canonicalizeFirmResourceRows({
      firms: [
        {
          id: aliasId,
          name: MORGAN_STANLEY_WEALTH_MANAGEMENT,
          hqCity: "New York",
          channel: "wirehouse",
        },
      ],
      mFirm: [
        { id: mentionId, articleId: uid("resource:article"), firmId: aliasId },
      ],
      firmAliases: [],
    });

    expect(rows.firms).toContainEqual(
      expect.objectContaining({
        id: canonicalId,
        name: MORGAN_STANLEY,
        hqCity: "New York",
      })
    );
    expect(rows.firms).not.toContainEqual(
      expect.objectContaining({ id: aliasId })
    );
    expect(rows.mFirm).toContainEqual(
      expect.objectContaining({ id: mentionId, firmId: canonicalId })
    );
    expect(rows.firmAliases).toContainEqual(
      expect.objectContaining({
        firmId: canonicalId,
        alias: MORGAN_STANLEY_WEALTH_MANAGEMENT,
      })
    );
  });
});
