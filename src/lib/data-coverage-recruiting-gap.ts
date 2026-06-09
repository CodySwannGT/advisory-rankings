import { findUnextractedRecruitingArticles } from "./recruiting-article-gap.js";

/**
 * One recruiting-shaped article that has no linked TransitionEvent — an
 * extraction gap that keeps a real move out of the recruiting surface.
 */
export interface RecruitingGapEntry {
  readonly id: string;
  readonly headline: string | null;
}

/** SQL reader matching the data-coverage query contract. */
type GapQuery = <T extends Readonly<Record<string, unknown>>>(
  query: string
) => Promise<ReadonlyArray<T>>;

/** Recruiting gap rows alongside any recoverable query warnings. */
interface RecruitingGapResult {
  readonly rows: ReadonlyArray<RecruitingGapEntry>;
  readonly warnings: ReadonlyArray<string>;
}

/** Rows plus recoverable warnings from a single guarded SQL read. */
interface SafeQueryResult<T extends Readonly<Record<string, unknown>>> {
  readonly rows: ReadonlyArray<T>;
  readonly warnings: ReadonlyArray<string>;
}

/**
 * Run one SQL query, capturing recoverable failures as a warning line.
 * @param query SQL reader.
 * @param sqlText SQL text to execute.
 * @returns Rows plus warnings.
 */
async function safeRows<T extends Readonly<Record<string, unknown>>>(
  query: GapQuery,
  sqlText: string
): Promise<SafeQueryResult<T>> {
  try {
    return { rows: await query<T>(sqlText), warnings: [] };
  } catch (error) {
    return {
      rows: [],
      warnings: [String(error).split("\n")[0] ?? "query failed"],
    };
  }
}

/**
 * Detect recruiting-shaped articles that have no linked TransitionEvent.
 * Reads articles and transition mentions, then applies the shared heuristic so
 * an ingested-but-unextracted move article is surfaced instead of staying
 * invisible to the recruiting product surface.
 * @param query SQL reader.
 * @returns Recruiting gap rows plus warnings.
 */
export async function detectUnextractedRecruiting(
  query: GapQuery
): Promise<RecruitingGapResult> {
  const articles = await safeRows<Readonly<Record<string, unknown>>>(
    query,
    "SELECT id, headline, category FROM data.Article"
  );
  const mentions = await safeRows<Readonly<Record<string, unknown>>>(
    query,
    "SELECT articleId FROM data.ArticleTransitionEventMention"
  );
  const mentionedIds = new Set(
    mentions.rows
      .map(row => String(row.articleId ?? ""))
      .filter(id => id.length > 0)
  );
  const gap = findUnextractedRecruitingArticles(
    articles.rows.map(row => ({
      id: String(row.id ?? ""),
      headline: row.headline == null ? null : String(row.headline),
      category: row.category == null ? null : String(row.category),
    })),
    mentionedIds
  );
  return {
    rows: gap.map(article => ({ id: article.id, headline: article.headline })),
    warnings: [...articles.warnings, ...mentions.warnings],
  };
}

/**
 * Build the operator warning for unextracted recruiting articles.
 * @param rows Recruiting gap entries.
 * @returns A single warning line when the gap is non-empty, else empty.
 */
export function unextractedRecruitingWarnings(
  rows: ReadonlyArray<RecruitingGapEntry>
): ReadonlyArray<string> {
  if (rows.length === 0) return [];
  const sample = rows
    .slice(0, 3)
    .map(row => row.headline ?? row.id)
    .join("; ");
  return [
    `recruiting extraction gap: ${rows.length} recruiting-shaped article(s) have no linked move (e.g. ${sample})`,
  ];
}
