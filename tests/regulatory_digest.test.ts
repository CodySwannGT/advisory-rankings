import { describe, expect, it } from "vitest";

import type {
  DisclosureEventCard,
  FeedItem,
} from "../src/harper/resource-feed-types.js";
import {
  digestContext,
  digestSourceLabel,
  regulatoryDigestItems,
} from "../src/web/regulatory-digest.js";

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
