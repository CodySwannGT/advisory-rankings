import { beforeEach, describe, expect, it, vi } from "vitest";

import { feedApiPath, type FeedPayload } from "../src/web/feed-route-utils.js";
import {
  feedCategories,
  feedSummaryText,
  filterFeedItems,
  readFeedFilters,
} from "../src/web/feed-filters.js";

const PUBLIC_WEB_RESEARCH = "public_web_research";
const PUBLIC_WEB_RESEARCH_SPACE = "public web research";
const PUBLIC_WEB_RESEARCH_DASH = "public-web-research";

describe("feed route filters", () => {
  beforeEach(() => {
    installLocationStub("/");
  });

  it("sends normalized category filters to the feed resource", () => {
    history.replaceState(null, "", "/?category=Public Web Research");

    expect(feedApiPath()).toBe("/Feed?category=public_web_research");
  });

  it("preserves category filters while paginating", () => {
    history.replaceState(null, "", "/?mode=event&category=firm-bio");

    expect(feedApiPath("cursor-1")).toBe(
      "/Feed?mode=event&category=firm_bio&cursor=cursor-1"
    );
  });

  it("keeps normalized server category matches visible client-side", () => {
    const items = [
      feedItem("public-web-research"),
      feedItem("public web research"),
      feedItem("firm_bio"),
    ];

    const filtered = filterFeedItems(items, {
      mode: "all",
      category: PUBLIC_WEB_RESEARCH,
    });

    expect(filtered.map(item => item.article?.category)).toEqual([
      PUBLIC_WEB_RESEARCH_DASH,
      PUBLIC_WEB_RESEARCH_SPACE,
    ]);
  });

  it("keeps the selected canonical category when payload rows use raw aliases", () => {
    history.replaceState(null, "", "/?category=public_web_research");
    const categories = feedCategories([
      feedItem(PUBLIC_WEB_RESEARCH_SPACE),
      feedItem(PUBLIC_WEB_RESEARCH_DASH),
    ]);

    expect(categories).toEqual([PUBLIC_WEB_RESEARCH]);
    expect(readFeedFilters(categories).category).toBe(PUBLIC_WEB_RESEARCH);
  });

  it("merges category options and matches rows by reader-facing label", () => {
    const categories = feedCategories([
      feedItem("public_web_research"),
      feedItem("web_research"),
      feedItem("firm_bio"),
    ]);

    const filtered = filterFeedItems(
      [feedItem("public_web_research"), feedItem("web_research")],
      { mode: "all", category: PUBLIC_WEB_RESEARCH }
    );

    expect(categories).toEqual(["public_web_research", "firm_bio"]);
    expect(filtered.map(item => item.article?.category)).toEqual([
      "public_web_research",
      "web_research",
    ]);
  });

  it("renders grammatical feed result counters", () => {
    const text = feedSummaryText({
      filters: { mode: "all", category: "", active: false },
      categories: [],
      count: 20,
      total: 50,
      onChange: () => {},
    });

    expect(text).toBe("Showing 20 of 50 posts.");
  });
});

function installLocationStub(path: string): void {
  const current = new URL(path, "https://advisorbook.test");
  vi.stubGlobal("location", current);
  vi.stubGlobal("history", {
    pushState: (_state: unknown, _title: string, next: string) => {
      vi.stubGlobal("location", new URL(next, current));
    },
    replaceState: (_state: unknown, _title: string, next: string) => {
      vi.stubGlobal("location", new URL(next, current));
    },
  });
}

function feedItem(category: string): NonNullable<FeedPayload["items"]>[number] {
  return {
    id: category,
    article: {
      id: category,
      title: category,
      url: `https://example.test/${category}`,
      source: "test",
      publishedDate: "2026-06-06",
      category,
    },
    advisors: [],
    firms: [],
    teams: [],
    eventCards: [],
  };
}
