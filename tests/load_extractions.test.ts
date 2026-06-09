import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runRecruitingArticleBackfill } from "../src/lib/recruiting-article-backfill.js";
import { buildRows } from "../src/scripts/load_extractions.js";

const EXAMPLE_ADVISOR_NAME = "Alex Example";
const ALEX_ADVISOR = "Alex Advisor";
const MORGAN_STANLEY = "Morgan Stanley";
const WELLS_FARGO = "Wells Fargo Advisors";
const UBS_WEALTH = "UBS Wealth Management USA";
const ROCKEFELLER = "Rockefeller Capital";
const BLAIR_BROKER = "Blair Broker";
const ALEX_WELLS_MOVE_DATE = "2026-05-01";
const COMPARATOR_MOVE_ANNOUNCED_DATE = "2026-05-02";

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
    const canonicalName = MORGAN_STANLEY;
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
            legal_name: ALEX_ADVISOR,
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

  it("loads every extracted recruiting move with article provenance", () => {
    const rows = buildRows({
      article: {
        url: "https://www.advisorhub.com/multi-move-profile/",
        headline: "Multi move profile",
      },
      firms: [
        { natural_key: { canonical_name: MORGAN_STANLEY } },
        { natural_key: { canonical_name: WELLS_FARGO } },
        { natural_key: { canonical_name: UBS_WEALTH } },
        { natural_key: { canonical_name: ROCKEFELLER } },
      ],
      advisors: [
        {
          natural_key: {
            legal_name: ALEX_ADVISOR,
            first_employer: MORGAN_STANLEY,
          },
        },
        {
          natural_key: {
            legal_name: BLAIR_BROKER,
            first_employer: UBS_WEALTH,
          },
        },
      ],
      transition_events: [
        {
          local_key: "alex-wells",
          subject_advisor_legal_name: ALEX_ADVISOR,
          from_firm_canonical_name: MORGAN_STANLEY,
          to_firm_canonical_name: WELLS_FARGO,
          fields: {
            moveDate: ALEX_WELLS_MOVE_DATE,
            aumMoved: 6000000000,
            notes: "Headline move.",
          },
        },
        {
          local_key: "blair-rockefeller",
          subject_advisor_legal_name: BLAIR_BROKER,
          from_firm_canonical_name: UBS_WEALTH,
          to_firm_canonical_name: ROCKEFELLER,
          fields: {
            announcedDate: COMPARATOR_MOVE_ANNOUNCED_DATE,
            aumMoved: 466000000,
            notes: "Comparator move mentioned in the article.",
          },
        },
      ],
    });

    expect(rows.TransitionEvent).toHaveLength(2);
    expect(rows.ArticleTransitionEventMention).toHaveLength(2);
    expect(
      rows.ArticleTransitionEventMention.map(row => row.articleId)
    ).toEqual([rows.Article[0].id, rows.Article[0].id]);
    expect(
      rows.ArticleTransitionEventMention.map(row => row.transitionEventId)
    ).toEqual(rows.TransitionEvent.map(row => row.id));
    expect(rows.TransitionEvent).toEqual([
      expect.objectContaining({
        fromFirmId: rows.Firm.find(row => row.name === MORGAN_STANLEY)?.id,
        toFirmId: rows.Firm.find(row => row.name === WELLS_FARGO)?.id,
        moveDate: ALEX_WELLS_MOVE_DATE,
        aumMoved: 6000000000,
      }),
      expect.objectContaining({
        fromFirmId: rows.Firm.find(row => row.name === UBS_WEALTH)?.id,
        toFirmId: rows.Firm.find(row => row.name === ROCKEFELLER)?.id,
        announcedDate: COMPARATOR_MOVE_ANNOUNCED_DATE,
        aumMoved: 466000000,
      }),
    ]);
  });

  it("loads comparator recruiting moves from dedicated mention arrays", () => {
    const rows = buildRows({
      article: {
        url: "https://www.advisorhub.com/comparator-move-profile/",
        headline: "Comparator move profile",
      },
      firms: [
        { natural_key: { canonical_name: UBS_WEALTH } },
        { natural_key: { canonical_name: ROCKEFELLER } },
        { natural_key: { canonical_name: WELLS_FARGO } },
      ],
      advisors: [
        {
          natural_key: {
            legal_name: BLAIR_BROKER,
            first_employer: UBS_WEALTH,
          },
        },
      ],
      comparator_transition_events: [
        {
          local_key: "blair-rockefeller-comparator",
          subject_advisor_legal_name: BLAIR_BROKER,
          from_firm_canonical_name: UBS_WEALTH,
          to_firm_canonical_name: ROCKEFELLER,
          fields: {
            announcedDate: COMPARATOR_MOVE_ANNOUNCED_DATE,
            aumMoved: 466000000,
            notes: "Comparator move mentioned in the article.",
          },
        },
      ],
      mentioned_transition_events: [
        {
          local_key: "blair-wells-mentioned",
          subject_advisor_legal_name: BLAIR_BROKER,
          from_firm_canonical_name: UBS_WEALTH,
          to_firm_canonical_name: WELLS_FARGO,
          fields: {
            announcedDate: "2026-04-21",
            aumMoved: 2100000000,
            notes: "Second comparator move mentioned in the article.",
          },
        },
      ],
    });

    expect(rows.TransitionEvent).toHaveLength(2);
    expect(rows.ArticleTransitionEventMention).toHaveLength(2);
    expect(
      rows.ArticleTransitionEventMention.map(row => row.articleId)
    ).toEqual([rows.Article[0].id, rows.Article[0].id]);
    expect(
      rows.ArticleTransitionEventMention.map(row => row.transitionEventId)
    ).toEqual(rows.TransitionEvent.map(row => row.id));
    expect(rows.TransitionEvent).toEqual([
      expect.objectContaining({
        fromFirmId: rows.Firm.find(row => row.name === UBS_WEALTH)?.id,
        toFirmId: rows.Firm.find(row => row.name === ROCKEFELLER)?.id,
        announcedDate: COMPARATOR_MOVE_ANNOUNCED_DATE,
        aumMoved: 466000000,
      }),
      expect.objectContaining({
        fromFirmId: rows.Firm.find(row => row.name === UBS_WEALTH)?.id,
        toFirmId: rows.Firm.find(row => row.name === WELLS_FARGO)?.id,
        announcedDate: "2026-04-21",
        aumMoved: 2100000000,
      }),
    ]);
  });

  it("records provenance for transition mentions missing required fields", () => {
    const rows = buildRows({
      article: {
        url: "https://www.advisorhub.com/skipped-move-profile/",
        headline: "Skipped move profile",
      },
      transitions: [
        {
          local_key: "unknown-subject",
          from_firm_canonical_name: MORGAN_STANLEY,
          to_firm_canonical_name: WELLS_FARGO,
        },
        {
          local_key: "missing-to",
          subject_advisor_legal_name: ALEX_ADVISOR,
          from_firm_canonical_name: MORGAN_STANLEY,
        },
      ],
    });

    expect(rows.TransitionEvent).toHaveLength(0);
    expect(rows.ArticleTransitionEventMention).toHaveLength(0);
    expect(rows.FieldAssertion).toEqual([
      expect.objectContaining({
        articleId: rows.Article[0].id,
        targetTable: "TransitionEventExtractionSkip",
        fieldName: "skipReason",
        assertedValue: JSON.stringify("missing_subject"),
      }),
      expect.objectContaining({
        articleId: rows.Article[0].id,
        targetTable: "TransitionEventExtractionSkip",
        fieldName: "skipReason",
        assertedValue: JSON.stringify("missing_from_or_to_firm"),
      }),
    ]);
  });

  it("runs a bounded dry-run recruiting article backfill with summary counts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "recruiting-backfill-"));
    const artifactPath = join(dir, "summary.json");
    try {
      await writeFile(
        join(dir, "001-recruiting.json"),
        JSON.stringify({
          article: {
            url: "https://www.advisorhub.com/recruiting-example/",
            headline: "Recruiting example",
            category: "recruiting",
          },
          firms: [
            { natural_key: { canonical_name: MORGAN_STANLEY } },
            { natural_key: { canonical_name: WELLS_FARGO } },
          ],
          advisors: [
            {
              natural_key: {
                legal_name: ALEX_ADVISOR,
                first_employer: MORGAN_STANLEY,
              },
            },
          ],
          transition_events: [
            {
              local_key: "alex-wells",
              subject_advisor_legal_name: ALEX_ADVISOR,
              from_firm_canonical_name: MORGAN_STANLEY,
              to_firm_canonical_name: WELLS_FARGO,
              fields: { moveDate: ALEX_WELLS_MOVE_DATE },
            },
          ],
        })
      );
      await writeFile(
        join(dir, "002-regulatory.json"),
        JSON.stringify({
          article: {
            url: "https://www.advisorhub.com/regulatory-example/",
            headline: "Regulatory example",
            category: "regulatory",
          },
        })
      );

      const summary = await runRecruitingArticleBackfill({
        sourceDir: dir,
        artifactPath,
        limit: 2,
        dryRun: true,
      });
      const artifact = JSON.parse(await readFile(artifactPath, "utf8"));

      expect(summary).toMatchObject({
        checkedCount: 2,
        loadedCount: 1,
        skippedCount: 1,
        articleCount: 1,
        moveCount: 1,
        unresolvedCount: 0,
      });
      expect(summary.files[1]).toMatchObject({
        status: "skipped",
        reason: "not_recruiting",
      });
      expect(summary.files[0]?.upserts).toMatchObject({
        Article: 1,
        TransitionEvent: 1,
        ArticleTransitionEventMention: 1,
      });
      expect(artifact.moveCount).toBe(1);
      expect(artifact.artifact).toBe("summary.json");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
