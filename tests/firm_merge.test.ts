import { describe, expect, it } from "vitest";
import { buildFirmMergePlan } from "../src/lib/firm-merge.js";
import { canonicalFirmId } from "../src/lib/firm-identity.js";
import { firmId, uid } from "../src/lib/ids.js";

describe("firm merge planning", () => {
  it("merges curated aliases, preserves details, and rewrites firm references", () => {
    const canonicalName = "Morgan Stanley";
    const aliasName = "Morgan Stanley Wealth Management";
    const aliasId = firmId("Morgan Stanley Wealth Management");
    const canonicalId = canonicalFirmId(canonicalName);
    const advisorId = uid("advisor:merge-test");
    const rows = buildFirmMergePlan({
      Firm: [
        {
          id: canonicalId,
          name: canonicalName,
          channel: "wirehouse",
        },
        {
          id: aliasId,
          name: aliasName,
          legalName: "Morgan Stanley Smith Barney LLC",
          hqCity: "New York",
          hqState: "NY",
          channel: "wirehouse",
        },
      ],
      EmploymentHistory: [
        {
          id: uid("eh:merge-test"),
          advisorId,
          firmId: aliasId,
        },
      ],
      Team: [
        {
          id: uid("team:merge-test"),
          name: "Example Team",
          currentFirmId: aliasId,
        },
      ],
      ArticleFirmMention: [
        {
          id: uid("afm:merge-test"),
          articleId: uid("article:merge-test"),
          firmId: aliasId,
        },
      ],
    });

    expect(rows.deleteFirmIds).toEqual([aliasId]);
    expect(rows.rows.Firm).toContainEqual(
      expect.objectContaining({
        id: canonicalId,
        name: canonicalName,
        legalName: "Morgan Stanley Smith Barney LLC",
        hqCity: "New York",
      })
    );
    expect(rows.rows.EmploymentHistory[0].firmId).toBe(canonicalId);
    expect(rows.rows.Team[0].currentFirmId).toBe(canonicalId);
    expect(rows.rows.ArticleFirmMention[0].firmId).toBe(canonicalId);
    expect(rows.rows.FirmAlias).toContainEqual(
      expect.objectContaining({
        firmId: canonicalId,
        alias: aliasName,
      })
    );
    expect(rows.rows.FirmMergeAudit).toContainEqual(
      expect.objectContaining({
        oldFirmId: aliasId,
        canonicalFirmId: canonicalId,
        reason: "curated_alias",
      })
    );
  });
});
