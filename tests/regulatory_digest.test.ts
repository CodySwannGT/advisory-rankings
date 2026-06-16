import { describe, expect, it } from "vitest";

import type {
  DisclosureEventCard,
  FeedItem,
} from "../src/harper/resource-feed-types.js";
import {
  digestContext,
  digestLimitations,
  digestSourceLabel,
  regulatoryDigestItems,
} from "../src/web/regulatory-digest.js";

const FIRM_CONTEXT_NAME = "Example Wealth";

describe("regulatory digest ranking", () => {
  it("orders public disclosure rows by event recency before severity signals", () => {
    const rows = regulatoryDigestItems([
      feedItem("older-severe", {
        dateResolved: "2026-03-01",
        status: "barred",
        sanctions: [sanction("bar")],
      }),
      feedItem("newer-less-severe", {
        dateResolved: "2026-05-01",
        status: "pending",
      }),
      feedItem("same-day-more-severe", {
        dateResolved: "2026-05-01",
        status: "suspended",
        sanctions: [sanction("fine")],
        settlementAmount: 250_000,
      }),
    ]);

    expect(rows.map(row => row.article.id)).toEqual([
      "same-day-more-severe",
      "newer-less-severe",
      "older-severe",
    ]);
  });

  it("exposes plain-language context and source freshness labels", () => {
    const [row] = regulatoryDigestItems([
      feedItem("source-a", {
        advisor: { id: "advisor-a", name: "Avery Stone" },
        dateInitiated: "2026-04-15",
      }),
    ]);

    expect(digestContext(row)).toBe("Avery Stone");
    expect(digestSourceLabel(row)).toContain("Event date 2026-04-15");
    expect(digestSourceLabel(row)).toContain("source published 2026-04-20");
  });

  it("preserves firm context when a disclosure has no advisor", () => {
    const [row] = regulatoryDigestItems([
      {
        ...feedItem("firm-source", {
          advisor: undefined,
          dateResolved: "2026-04-01",
        }),
        firms: [
          {
            id: "firm-a",
            kind: "firm",
            name: FIRM_CONTEXT_NAME,
            short: "Example",
            logoUrl: null,
            channel: "ria",
            hq: "Austin, TX",
            dissolvedYear: null,
          },
        ],
      },
    ]);

    expect(row.firm?.name).toBe(FIRM_CONTEXT_NAME);
    expect(digestContext(row)).toBe(FIRM_CONTEXT_NAME);
  });

  it("describes missing evidence as a limitation instead of clean evidence", () => {
    const [row] = regulatoryDigestItems([
      feedItem("limited-source", {
        dateResolved: "2026-04-01",
      }),
    ]);

    expect(digestLimitations(row)).toEqual([
      "Structured sanction or rule context is not loaded for this row; missing details are a source limitation, not clean evidence.",
      "BrokerCheck context is not present in this digest row; use the public evidence links before drawing conclusions.",
    ]);
  });

  it("does not add limitation copy when public sanction and BrokerCheck cues exist", () => {
    const [row] = regulatoryDigestItems([
      feedItem("source-backed", {
        regulator: "FINRA BrokerCheck",
        ruleViolations: ["FINRA Rule 2010"],
        sanctions: [sanction("fine")],
      }),
    ]);

    expect(digestLimitations(row)).toEqual([]);
  });

  it("recognizes normalized public BrokerCheck cues", () => {
    const rows = regulatoryDigestItems([
      feedItem("spaced-broker-check", {
        allegationText: "See Broker Check summary",
        sanctions: [sanction("fine")],
      }),
      feedItem("hyphenated-broker-check", {
        allegationCategories: ["broker-check disclosure"],
        sanctions: [sanction("suspension")],
      }),
      feedItem("compact-brokercheck", {
        forum: "BROKERCHECK",
        sanctions: [sanction("fine")],
      }),
      feedItem("mixed-case-brokercheck-rule", {
        ruleViolations: ["BrokerCheck source record"],
        sanctions: [sanction("suspension")],
      }),
    ]);

    expect(rows.map(row => digestLimitations(row))).toEqual([[], [], [], []]);
  });
});

function feedItem(
  id: string,
  disclosure: Partial<DisclosureEventCard>
): FeedItem {
  return {
    article: {
      id,
      headline: `Article ${id}`,
      dek: "",
      url: `https://example.com/${id}`,
      slug: undefined,
      publishedDate: "2026-04-20",
      modifiedDate: undefined,
      authors: [],
      category: "regulatory",
    },
    eventCards: [disclosureCard(id, disclosure)],
    advisors: [],
    firms: [],
    teams: [],
  };
}

function disclosureCard(
  id: string,
  disclosure: Partial<DisclosureEventCard>
): DisclosureEventCard {
  return {
    kind: "disclosure",
    id: `disclosure-${id}`,
    disclosureId: `disclosure-${id}`,
    advisor: undefined,
    disclosureType: "regulatory",
    regulator: "finra",
    regulatorState: undefined,
    forum: undefined,
    status: undefined,
    admitDeny: undefined,
    dateInitiated: undefined,
    dateResolved: undefined,
    allegationText: undefined,
    allegationCategories: undefined,
    ruleViolations: undefined,
    awardAmount: undefined,
    settlementAmount: undefined,
    damagesRequested: undefined,
    clusterId: undefined,
    sanctions: [],
    ...disclosure,
  };
}

function sanction(
  sanctionType: string
): DisclosureEventCard["sanctions"][number] {
  return {
    id: `sanction-${sanctionType}`,
    disclosureId: `disclosure-${sanctionType}`,
    sanctionType,
    amount: undefined,
    durationMonths: undefined,
    jurisdiction: undefined,
  };
}
