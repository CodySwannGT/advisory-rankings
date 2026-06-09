/**
 * Recruiting-article gap detection.
 *
 * AdvisorHub recruiting headlines are formulaic ("Firm Snags $7M Team From
 * OtherFirm", "Advisor Joins Firm"). A move article is only useful once it has
 * produced a `TransitionEvent`; the recruiting "Recent Moves" surface is built
 * exclusively from those rows. An article that reads like a move but has no
 * linked transition is an extraction gap — invisible to the product and to
 * operators. This module is the single source of truth for "looks like a
 * recruiting move", reused by ingest categorization and the data-coverage
 * guard so the heuristic can never drift between the two.
 */

/**
 * Headline verbs/phrases that signal an article describes an advisor or team
 * move between firms. Kept as small per-verb patterns (rather than one large
 * alternation) so each stays simple and the set is easy to extend.
 * Intentionally recall-leaning: a guard would rather flag an article for
 * review than silently miss a real move.
 */
const RECRUITING_HEADLINE_PATTERNS: readonly RegExp[] = [
  /\bsnags?\b/i,
  /\bsnagged\b/i,
  /\brecruits?\b/i,
  /\brecruit(?:ed|ing)\b/i,
  /\bhires?\b/i,
  /\bhired\b/i,
  /\bhiring\b/i,
  /\blands?\b/i,
  /\blanded\b/i,
  /\bpoach(?:es|ed|ing)?\b/i,
  /\bnabs?\b/i,
  /\bnabbed\b/i,
  /\blures?\b/i,
  /\blured\b/i,
  /\bluring\b/i,
  /\bdefects?\b/i,
  /\bdefected\b/i,
  /\bbreakaway\b/i,
  /\bjumps?\s+to\b/i,
  /\bjumped\s+to\b/i,
  /\bjoins?\b/i,
  /\bjoined\b/i,
  /\bpicks?\s+up\b/i,
  /\bpicked\s+up\b/i,
  /\bbrings?\s+on\b/i,
  /\bwelcome[sd]?\b/i,
  /\bonboards?\b/i,
  /\bonboarded\b/i,
];

/** The category value assigned to articles that read like a recruiting move. */
const RECRUITING_CATEGORY = "recruiting";

/** Minimal article shape needed to judge the recruiting gap. */
interface RecruitingGapArticle {
  readonly id: string;
  readonly headline: string | null;
  readonly category?: string | null;
}

/**
 * Tests whether a headline reads like an advisor/team recruiting move.
 * @param headline - Article headline text (may be empty or null).
 * @returns True when the headline matches a recruiting move pattern.
 */
export function isRecruitingShapedHeadline(
  headline: string | null | undefined
): boolean {
  const text = headline ?? "";
  return RECRUITING_HEADLINE_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Tests whether an article is recruiting-shaped by its category or headline.
 * An explicit `recruiting` category always qualifies; otherwise the headline
 * heuristic decides.
 * @param article - Article with at least a headline and optional category.
 * @returns True when the article should carry a recruiting move.
 */
export function isRecruitingShapedArticle(
  article: Pick<RecruitingGapArticle, "headline" | "category">
): boolean {
  if ((article.category ?? "").trim().toLowerCase() === RECRUITING_CATEGORY)
    return true;
  return isRecruitingShapedHeadline(article.headline);
}

/**
 * Derives an article category from its headline, preserving any existing
 * non-empty category and only upgrading the default `unknown` placeholder to
 * `recruiting` when the headline reads like a move.
 * @param headline - Article headline text.
 * @param current - Existing category value, when known.
 * @returns The category to persist.
 */
export function deriveArticleCategory(
  headline: string | null | undefined,
  current?: string | null
): string {
  const existing = (current ?? "").trim();
  if (existing && existing.toLowerCase() !== "unknown") return existing;
  return isRecruitingShapedHeadline(headline)
    ? RECRUITING_CATEGORY
    : existing || "unknown";
}

/**
 * Finds recruiting-shaped articles that have no linked `TransitionEvent`
 * mention — the extraction gap a move article falls into when it is ingested
 * but never run through move extraction.
 * @param articles - Candidate articles to inspect.
 * @param mentionedArticleIds - Article ids that already have a transition mention.
 * @returns Recruiting-shaped articles lacking any transition mention.
 */
export function findUnextractedRecruitingArticles(
  articles: readonly RecruitingGapArticle[],
  mentionedArticleIds: ReadonlySet<string>
): readonly RecruitingGapArticle[] {
  return articles.filter(
    article =>
      isRecruitingShapedArticle(article) && !mentionedArticleIds.has(article.id)
  );
}
