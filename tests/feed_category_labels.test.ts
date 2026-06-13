import { describe, expect, it } from "vitest";

import { feedCategoryLabel } from "../src/web/feed-category-labels.js";

const ADVISOR_RESEARCH_LABEL = "Advisor research";

describe("feedCategoryLabel", () => {
  it("uses reader-facing labels for source-backed feed categories", () => {
    expect(feedCategoryLabel("public_web_research")).toBe(
      ADVISOR_RESEARCH_LABEL
    );
    expect(feedCategoryLabel("public web research")).toBe(
      ADVISOR_RESEARCH_LABEL
    );
    expect(feedCategoryLabel("public-web-research")).toBe(
      ADVISOR_RESEARCH_LABEL
    );
    expect(feedCategoryLabel("web_research")).toBe(ADVISOR_RESEARCH_LABEL);
    expect(feedCategoryLabel("firm_bio")).toBe("Firm profile updates");
  });

  it("uses human-facing copy for uncategorized fallback categories", () => {
    expect(feedCategoryLabel("unknown")).toBe("Uncategorized");
    expect(feedCategoryLabel("")).toBe("Uncategorized");
  });

  it("keeps unknown machine values readable without changing the value contract", () => {
    expect(feedCategoryLabel("future_signal_bucket")).toBe(
      "Future Signal Bucket"
    );
  });
});
