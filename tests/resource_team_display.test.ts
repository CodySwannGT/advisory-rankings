import { describe, expect, it } from "vitest";
import {
  publicTeamDisplayName,
  publicTeamIdentityKey,
  publicTeamRow,
} from "../src/harper/resource-team-display.js";
import type { TeamRow } from "../src/types/harper-schema.js";

describe("public team display helpers", () => {
  const CLEAN_NAME = "Alpha Group";
  const MARKED_NAME = `${CLEAN_NAME} - NON-COMPLIANT`;

  const team: TeamRow = {
    id: "team-alpha",
    name: CLEAN_NAME,
    currentFirmId: "firm-alpha",
  };

  it("removes internal non-compliant markers from public team names", () => {
    expect(publicTeamDisplayName(` ${MARKED_NAME} `)).toBe(CLEAN_NAME);
    expect(publicTeamDisplayName(`${CLEAN_NAME} - non-compliant`)).toBe(
      CLEAN_NAME
    );
  });

  it("normalizes nullish and unchanged display names", () => {
    expect(publicTeamDisplayName(null)).toBe("");
    expect(publicTeamDisplayName(undefined)).toBe("");
    expect(publicTeamDisplayName(`  ${CLEAN_NAME}  `)).toBe(CLEAN_NAME);
  });

  it("rewrites marked team rows without mutating clean rows", () => {
    expect(publicTeamRow(team)).toBe(team);

    const marked = {
      ...team,
      name: MARKED_NAME,
    };
    const row = publicTeamRow(marked);

    expect(row).not.toBe(marked);
    expect(row).toEqual({ ...team, name: CLEAN_NAME });
  });

  it("uses firm ids when available and team ids otherwise for identity", () => {
    expect(
      publicTeamIdentityKey({
        ...team,
        name: MARKED_NAME,
      })
    ).toBe("alpha group\u0000firm-alpha");
    expect(publicTeamIdentityKey({ id: "team-beta", name: "Beta Group" })).toBe(
      "beta group\u0000team-beta"
    );
  });
});
