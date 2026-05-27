#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as cheerio from "cheerio";
import { articleId, firmId, uid } from "../lib/ids.js";
import { canonicalFirmName } from "../lib/firm-identity.js";
import { describeTarget, upsert } from "../lib/harper.js";
import type {
  ArticleFirmMentionRow,
  ArticleRow,
  FieldAssertionRow,
  FirmRow,
} from "../types/harper-schema.js";

const WELLS_FARGO_ADVISORS = "Wells Fargo Advisors";
const MERRILL_LYNCH = "Merrill Lynch";

const FIRM_ALIASES: ReadonlyArray<readonly [string, string]> = [
  [
    "Morgan Stanley Wealth Management",
    canonicalFirmName("Morgan Stanley Wealth Management"),
  ],
  ["Morgan Stanley", canonicalFirmName("Morgan Stanley")],
  ["Wells Fargo Advisors", WELLS_FARGO_ADVISORS],
  ["Wells Fargo", WELLS_FARGO_ADVISORS],
  ["FiNet", "Wells Fargo Advisors Financial Network (FiNet)"],
  ["Merrill Lynch", MERRILL_LYNCH],
  ["Merrill", MERRILL_LYNCH],
  ["Bank of America", "Bank of America"],
  ["UBS", "UBS Wealth Management USA"],
  ["J.P. Morgan", "J.P. Morgan Advisors"],
  ["JPMorgan", "J.P. Morgan Advisors"],
  ["Goldman Sachs", "Goldman Sachs"],
  ["Stanford Financial", "Stanford Financial Group"],
  ["Chelsea Financial", "Chelsea Financial Services"],
];

/** WordPress `{ rendered: "<html>" }` HTML envelope. */
interface RenderedHtml {
  readonly rendered?: string;
}

/** Raw WordPress post shape persisted by the crawler. */
interface RawWpPost {
  readonly id?: number | string;
  readonly link?: string;
  readonly url?: string;
  readonly slug?: string;
  readonly type?: string;
  readonly date?: string;
  readonly modified?: string;
  readonly title?: string | RenderedHtml;
  readonly content?: RenderedHtml;
}

/** Rows produced by ingesting a single WordPress post. */
interface PostIngestRows {
  readonly article: ArticleRow;
  readonly firms: ReadonlyArray<FirmRow>;
  readonly firmMentions: ReadonlyArray<ArticleFirmMentionRow>;
  readonly fieldAssertions: ReadonlyArray<FieldAssertionRow>;
}

/** Aggregated rows across every ingested post, deduplicated by table. */
interface AggregatedRows {
  readonly Article: ReadonlyArray<ArticleRow>;
  readonly Firm: ReadonlyArray<FirmRow>;
  readonly ArticleFirmMention: ReadonlyArray<ArticleFirmMentionRow>;
  readonly FieldAssertion: ReadonlyArray<FieldAssertionRow>;
}

/**
 * Handles opt for this workflow.
 * @param name - Display name or option name.
 * @param fallback - Fallback value when no explicit value is supplied.
 * @returns The computed value.
 */
function opt(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

/**
 * Handles text from html for this workflow.
 * @param html - html used by this operation.
 * @returns Plain text extracted from the HTML.
 */
function textFromHtml(html: string): string {
  return cheerio.load(html).text().replace(/\s+/g, " ").trim();
}

/**
 * Finds saved WordPress post JSON files produced by the crawler.
 * @param root - Root crawl output directory.
 * @returns Async stream of post JSON paths.
 */
async function* postFiles(root: string): AsyncGenerator<string> {
  if (!existsSync(root)) return;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of await readdir(join(root, entry.name))) {
      if (file.startsWith("post_") && file.endsWith(".json"))
        yield join(root, entry.name, file);
    }
  }
}

/**
 * Extracts the headline string from a WordPress title field.
 * @param title - Raw WP title (string or `{ rendered }` object).
 * @returns Plain-text headline.
 */
function headlineFromTitle(title: RawWpPost["title"]): string {
  if (typeof title === "string") return textFromHtml(title);
  return textFromHtml(title?.rendered ?? "");
}

/**
 * Converts a single parsed WordPress post into the rows it contributes.
 * @param post - Parsed WordPress post JSON.
 * @returns Per-post ingest rows.
 */
function rowsForPost(post: RawWpPost): PostIngestRows {
  const url = post.link ?? post.url ?? String(post.id ?? "");
  const aid = articleId(url);
  const headline = headlineFromTitle(post.title);
  const body = textFromHtml(post.content?.rendered ?? "");
  const article: ArticleRow = {
    id: aid,
    ...(typeof post.id === "number" ? { wpId: post.id } : {}),
    wpPostType: post.type ?? "post",
    url,
    ...(post.slug !== undefined ? { slug: post.slug } : {}),
    headline,
    publishedDate: String(post.date ?? "").slice(0, 10),
    modifiedDate: String(post.modified ?? "").slice(0, 10),
    category: "unknown",
  };
  const aliasMatches = FIRM_ALIASES.filter(
    ([alias]) => body.includes(alias) || headline.includes(alias)
  );
  const firms: ReadonlyArray<FirmRow> = aliasMatches.map(([, canonical]) => ({
    id: firmId(canonical),
    name: canonical,
    channel: "unknown",
  }));
  const firmMentions: ReadonlyArray<ArticleFirmMentionRow> = aliasMatches.map(
    ([, canonical]) => {
      const fid = firmId(canonical);
      return { id: uid(`afm:${aid}:${fid}`), articleId: aid, firmId: fid };
    }
  );
  const fieldAssertions: ReadonlyArray<FieldAssertionRow> = Array.from(
    body.matchAll(/\$([\d,.]+)\s*(billion|million)?/gi)
  ).map(match => ({
    id: uid(`fa:${aid}:money:${match.index}`),
    articleId: aid,
    targetTable: "Article",
    targetId: aid,
    fieldName: "moneyMention",
    assertedValue: match[0],
    quotePhrase: match[0],
    confidence: "candidate",
  }));
  return { article, firms, firmMentions, fieldAssertions };
}

/**
 * Deduplicates firm rows by id while preserving first-seen order.
 * @param firms - Firm rows from every post.
 * @returns Deduplicated firm rows.
 */
function dedupeFirms(firms: ReadonlyArray<FirmRow>): ReadonlyArray<FirmRow> {
  return Array.from(new Map(firms.map(firm => [firm.id, firm])).values());
}

/**
 * Reads every post file under `root` and folds the per-post rows into a
 * single aggregated bundle ready for upsert.
 * @param root - Root crawl output directory.
 * @param limit - Maximum number of posts to ingest (0 = no cap).
 * @returns Aggregated rows keyed by Harper table name.
 */
async function collectRows(
  root: string,
  limit: number
): Promise<AggregatedRows> {
  const files: ReadonlyArray<string> = await collectFiles(root, limit);
  const perPost: ReadonlyArray<PostIngestRows> = await Promise.all(
    files.map(async file => {
      const raw = await readFile(file, "utf8");
      return rowsForPost(JSON.parse(raw) as RawWpPost);
    })
  );
  return {
    Article: perPost.map(p => p.article),
    Firm: dedupeFirms(perPost.flatMap(p => p.firms)),
    ArticleFirmMention: perPost.flatMap(p => p.firmMentions),
    FieldAssertion: perPost.flatMap(p => p.fieldAssertions),
  };
}

/**
 * Materializes the async post-file iterator into an array, honoring `limit`.
 * @param root - Root crawl output directory.
 * @param limit - Maximum number of files to collect (0 = no cap).
 * @returns Ordered list of post file paths.
 */
async function collectFiles(
  root: string,
  limit: number
): Promise<ReadonlyArray<string>> {
  const all: ReadonlyArray<string> = await Array.fromAsync(postFiles(root));
  return limit > 0 ? all.slice(0, limit) : all;
}

console.error(`[ingest] target: ${describeTarget()}`);
const root = opt("--wpjson-dir", "research/wpjson");
const limit = Number(opt("--limit", "0"));
const rows = await collectRows(root, limit);

for (const [table, tableRows] of Object.entries(rows)) {
  console.log(
    `  upsert ${table}: ${tableRows.length} (${await upsert(table, tableRows)} touched)`
  );
}
