import { describe, expect, it } from "vitest";
import {
  canonicalizeFirmResourceRows,
  canonicalizeForFirmsDirectory,
  canonicalizeForTeamsDirectory,
  type CanonicalFirmRowsInput,
  type CanonicalTeamRowsInput,
} from "../src/harper/resource-firm-canonicalization.js";
import { canonicalFirmId } from "../src/lib/firm-identity.js";
import { firmId, uid } from "../src/lib/ids.js";

const MORGAN_STANLEY = "Morgan Stanley";
const MORGAN_STANLEY_WEALTH_MANAGEMENT = "Morgan Stanley Wealth Management";
const MORGAN_STANLEY_ID = canonicalFirmId(MORGAN_STANLEY_WEALTH_MANAGEMENT);
const HARBOR_TEAM = "Harbor Team";

describe("public resource firm canonicalization", () => {
  it("renders stale alias-only data as the canonical Morgan Stanley firm", () => {
    const aliasId = firmId(MORGAN_STANLEY_WEALTH_MANAGEMENT);
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
        id: MORGAN_STANLEY_ID,
        name: MORGAN_STANLEY,
        hqCity: "New York",
      })
    );
    expect(rows.firms).not.toContainEqual(
      expect.objectContaining({ id: aliasId })
    );
    expect(rows.mFirm).toContainEqual(
      expect.objectContaining({ id: mentionId, firmId: MORGAN_STANLEY_ID })
    );
    expect(rows.firmAliases).toContainEqual(
      expect.objectContaining({
        firmId: MORGAN_STANLEY_ID,
        alias: MORGAN_STANLEY_WEALTH_MANAGEMENT,
      })
    );
  });

  it("keeps curated alias metadata when no firm rows are loaded", () => {
    const rows = canonicalizeFirmResourceRows({
      firmAliases: [
        {
          id: "68e35dd7-ed75-54a6-9ea2-417545e25f17",
          firmId: uid("stale-firm"),
          alias: "Stale Morgan Stanley Alias",
        },
      ],
      teams: [
        {
          id: uid("team"),
          name: `${HARBOR_TEAM} - NON-COMPLIANT`,
          currentFirmId: uid("firm"),
        },
      ],
    });

    expect(rows.firms).toBeUndefined();
    expect(rows.firmAliases).toHaveLength(1);
    expect(rows.firmAliases).toContainEqual(
      expect.objectContaining({
        firmId: MORGAN_STANLEY_ID,
        alias: MORGAN_STANLEY_WEALTH_MANAGEMENT,
        normalizedAlias: "morgan stanley wealth management",
      })
    );
    expect(rows.teams).toContainEqual(
      expect.objectContaining({ name: HARBOR_TEAM })
    );
  });

  it("merges the most complete alias row into an existing canonical firm", () => {
    const aliasId = firmId(MORGAN_STANLEY_WEALTH_MANAGEMENT);
    const rows = canonicalizeFirmResourceRows({
      firms: [
        {
          id: MORGAN_STANLEY_ID,
          name: MORGAN_STANLEY,
          hqCity: "",
          notes: ["retained"],
        },
        {
          id: aliasId,
          name: MORGAN_STANLEY_WEALTH_MANAGEMENT,
          hqCity: "Purchase",
          channel: "wirehouse",
          notes: [],
          rank: 1,
        },
      ],
      transitions: [
        {
          id: uid("transition"),
          subjectFirmId: aliasId,
          fromFirmId: aliasId,
          toFirmId: uid("target-firm"),
        },
      ],
    });

    expect(rows.firms).toEqual([
      expect.objectContaining({
        id: MORGAN_STANLEY_ID,
        name: MORGAN_STANLEY,
        hqCity: "Purchase",
        channel: "wirehouse",
        notes: ["retained"],
        rank: 1,
      }),
    ]);
    expect(rows.transitions).toContainEqual(
      expect.objectContaining({
        subjectFirmId: MORGAN_STANLEY_ID,
        fromFirmId: MORGAN_STANLEY_ID,
      })
    );
  });

  it("defensively drops malformed typed directory row inputs", () => {
    const rows = canonicalizeForFirmsDirectory({
      firms: [{ id: uid("firm"), name: "Example Firm" }, null],
      firmAliases: "not-an-array",
    } as unknown as CanonicalFirmRowsInput);

    expect(rows.firms).toEqual([]);
  });

  it("deduplicates public teams after display-name cleanup", () => {
    const firm = {
      id: MORGAN_STANLEY_ID,
      name: MORGAN_STANLEY,
    };
    const rows = canonicalizeForTeamsDirectory({
      firms: [firm],
      firmAliases: [],
      teams: [
        {
          id: "team-b",
          name: `${HARBOR_TEAM} - NON-COMPLIANT`,
          currentFirmId: firm.id,
        },
        {
          id: "team-a",
          name: HARBOR_TEAM,
          currentFirmId: firm.id,
        },
      ],
    } as unknown as CanonicalTeamRowsInput);

    expect(rows.teams).toEqual([
      expect.objectContaining({ id: "team-a", name: HARBOR_TEAM }),
    ]);
  });
});
