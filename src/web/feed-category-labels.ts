import { formatInlineLabel } from "./design-system/format-label.js";

const FEED_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  advisorhub_article: "Industry news",
  barrons_profile: "Advisor rankings profile",
  curated_merge: "Curated profile update",
  firm_bio: "Firm profile updates",
  press: "Firm news",
  public_web_research: "Advisor research",
  rankings: "Rankings updates",
  web_research: "Advisor research",
};

/**
 * Converts stable feed category values into reader-facing copy.
 * @param value - Raw article category or filter value.
 * @returns Visible category label.
 */
export function feedCategoryLabel(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "Uncategorized";
  return (
    FEED_CATEGORY_LABELS[normalized] ??
    formatInlineLabel(normalized) ??
    normalized
  );
}
