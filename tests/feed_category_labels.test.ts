import { describe, expect, it } from "vitest";

import { feedCategoryLabel } from "../src/web/feed-category-labels.js";

describe("feedCategoryLabel", () => {
  it("uses reader-facing labels for source-backed feed categories", () => {
    expect(feedCategoryLabel("public_web_research")).toBe("Advisor research");
    expect(feedCategoryLabel("web_research")).toBe("Advisor research");
    expect(feedCategoryLabel("firm_bio")).toBe("Firm profile updates");
  });

  it("keeps unknown machine values readable without changing the value contract", () => {
    expect(feedCategoryLabel("future_signal_bucket")).toBe(
      "Future Signal Bucket"
    );
  });
});
