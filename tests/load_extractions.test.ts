import { describe, expect, it } from "vitest";
import { buildRows } from "../src/scripts/load_extractions.js";

describe("AdvisorHub extraction loader", () => {
  it("keeps scraped advisor headshots and firm logos on entity rows", () => {
    const firmName = "Example Wealth";
    const rows = buildRows({
      article: {
        url: "https://www.advisorhub.com/example-profile/",
        headline: "Example profile",
      },
      firms: [
        {
          natural_key: { canonical_name: firmName },
          fields: {
            channel: "pure_ria",
            logoUrl: "https://example.com/assets/example-wealth-logo.png",
          },
        },
      ],
      advisors: [
        {
          natural_key: {
            legal_name: "Alex Example",
            first_employer: firmName,
          },
          fields: {
            firstName: "Alex",
            lastName: "Example",
            headshotUrl: "https://example.com/assets/alex-example.jpg",
          },
        },
      ],
    });

    expect(rows.Advisor).toContainEqual(
      expect.objectContaining({
        legalName: "Alex Example",
        headshotUrl: "https://example.com/assets/alex-example.jpg",
      })
    );
    expect(rows.Firm).toContainEqual(
      expect.objectContaining({
        name: firmName,
        logoUrl: "https://example.com/assets/example-wealth-logo.png",
      })
    );
  });

  it("resolves firm aliases for mentions and employment rows", () => {
    const canonicalName = "Morgan Stanley";
    const aliasName = "Morgan Stanley Wealth Management";
    const rows = buildRows({
      article: {
        url: "https://www.advisorhub.com/morgan-stanley-profile/",
        headline: "Morgan Stanley profile",
      },
      firms: [
        {
          natural_key: { canonical_name: aliasName },
          fields: { channel: "wirehouse" },
        },
      ],
      advisors: [
        {
          natural_key: {
            legal_name: "Alex Advisor",
            first_employer: aliasName,
          },
          fields: {
            firstName: "Alex",
            lastName: "Advisor",
          },
        },
      ],
      employment_histories: [
        {
          advisor_legal_name: "Alex Advisor",
          firm_canonical_name: aliasName,
          fields: {
            startDate: "2024-01-01",
          },
        },
      ],
    });

    const firm = rows.Firm[0];
    expect(firm).toMatchObject({ name: canonicalName });
    expect(rows.ArticleFirmMention[0].firmId).toBe(firm.id);
    expect(rows.EmploymentHistory[0].firmId).toBe(firm.id);
    expect(rows.FirmAlias).toContainEqual(
      expect.objectContaining({
        firmId: firm.id,
        alias: aliasName,
      })
    );
  });
});
