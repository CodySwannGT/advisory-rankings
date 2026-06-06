import { describe, expect, it } from "vitest";
import { buildRows } from "../src/scripts/load_extractions.js";

const EXAMPLE_ADVISOR_NAME = "Alex Example";

describe("AdvisorHub extraction loader", () => {
  it("derives Article.publishedDate from modifiedDate when the source omits it", () => {
    const rows = buildRows({
      article: {
        url: "https://www.advisorhub.com/date-less-profile/",
        headline: "Date-less profile",
        modifiedDate: "2026-06-05T18:30:00Z",
      },
    });

    expect(rows.Article[0]?.publishedDate).toBe("2026-06-05");
    expect(rows.Article[0]?.modifiedDate).toBeUndefined();
  });

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
            legal_name: EXAMPLE_ADVISOR_NAME,
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
        legalName: EXAMPLE_ADVISOR_NAME,
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

  it("resolves field assertions to public target ids", () => {
    const firmName = "Example Wealth";
    const rows = buildRows({
      article: {
        url: "https://www.advisorhub.com/example-provenance/",
        headline: "Example provenance",
      },
      firms: [
        {
          natural_key: { canonical_name: firmName },
          fields: { channel: "pure_ria" },
        },
      ],
      advisors: [
        {
          natural_key: {
            legal_name: EXAMPLE_ADVISOR_NAME,
            first_employer: firmName,
          },
          fields: { firstName: "Alex", lastName: "Example" },
        },
      ],
      disclosures: [
        {
          local_key: "disc-1",
          advisor_legal_name: EXAMPLE_ADVISOR_NAME,
          fields: {
            disclosureType: "customer_dispute",
            dateInitiated: "2025-01-01",
            regulator: "FINRA",
          },
        },
      ],
      field_assertions: [
        {
          target_table: "Advisor",
          target_ref: EXAMPLE_ADVISOR_NAME,
          field: "legalName",
          value: EXAMPLE_ADVISOR_NAME,
        },
        {
          target_table: "Firm",
          target_ref: firmName,
          field: "channel",
          value: "pure_ria",
        },
        {
          target_table: "Disclosure",
          target_ref: "disc-1",
          field: "status",
          value: "pending",
        },
        {
          target_table: "Article",
          target_ref: "self",
          field: "headline",
          value: "Example provenance",
        },
      ],
    });

    expect(rows.FieldAssertion).toEqual([
      expect.objectContaining({
        targetTable: "Advisor",
        targetId: rows.Advisor[0].id,
        fieldName: "legalName",
      }),
      expect.objectContaining({
        targetTable: "Firm",
        targetId: rows.Firm[0].id,
        fieldName: "channel",
      }),
      expect.objectContaining({
        targetTable: "Disclosure",
        targetId: rows.Disclosure[0].id,
        fieldName: "status",
      }),
      expect.objectContaining({
        targetTable: "Article",
        targetId: rows.Article[0].id,
        fieldName: "headline",
      }),
    ]);
  });
});
