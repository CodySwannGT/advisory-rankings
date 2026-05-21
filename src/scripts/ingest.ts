#!/usr/bin/env node
// @ts-nocheck
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as cheerio from "cheerio";
import { articleId, firmId, uid } from "../lib/ids.js";
import { describeTarget, upsert } from "../lib/harper.js";

const FIRM_ALIASES: Array<[string, string]> = [
  ["Morgan Stanley Wealth Management", "Morgan Stanley Wealth Management"],
  ["Morgan Stanley", "Morgan Stanley Wealth Management"],
  ["Wells Fargo Advisors", "Wells Fargo Advisors"],
  ["Wells Fargo", "Wells Fargo Advisors"],
  ["FiNet", "Wells Fargo Advisors Financial Network (FiNet)"],
  ["Merrill Lynch", "Merrill Lynch"],
  ["Merrill", "Merrill Lynch"],
  ["Bank of America", "Bank of America"],
  ["UBS", "UBS Wealth Management USA"],
  ["J.P. Morgan", "J.P. Morgan Advisors"],
  ["JPMorgan", "J.P. Morgan Advisors"],
  ["Goldman Sachs", "Goldman Sachs"],
  ["Stanford Financial", "Stanford Financial Group"],
  ["Chelsea Financial", "Chelsea Financial Services"],
];

function opt(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function textFromHtml(html: string): string {
  return cheerio.load(html).text().replace(/\s+/g, " ").trim();
}

async function* postFiles(root: string): AsyncGenerator<string> {
  if (!existsSync(root)) return;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of await readdir(join(root, entry.name))) {
      if (file.startsWith("post_") && file.endsWith(".json")) yield join(root, entry.name, file);
    }
  }
}

console.error(`[ingest] target: ${describeTarget()}`);
const root = opt("--wpjson-dir", "research/wpjson");
const limit = Number(opt("--limit", "0"));
const rows: Record<string, Record<string, unknown>[]> = {
  Article: [],
  Firm: [],
  ArticleFirmMention: [],
  FieldAssertion: [],
};

let seen = 0;
const seenFirms = new Set<string>();
for await (const file of postFiles(root)) {
  if (limit && seen >= limit) break;
  seen++;
  const post = JSON.parse(await readFile(file, "utf8"));
  const url = post.link ?? post.url ?? String(post.id);
  const aid = articleId(url);
  const headline = textFromHtml(post.title?.rendered ?? post.title ?? "");
  const body = textFromHtml(post.content?.rendered ?? "");
  rows.Article.push({
    id: aid,
    wpId: post.id,
    wpPostType: post.type ?? "post",
    url,
    slug: post.slug,
    headline,
    publishedDate: String(post.date ?? "").slice(0, 10),
    modifiedDate: String(post.modified ?? "").slice(0, 10),
    category: "unknown",
  });
  for (const [alias, canonical] of FIRM_ALIASES) {
    if (!body.includes(alias) && !headline.includes(alias)) continue;
    const fid = firmId(canonical);
    if (!seenFirms.has(fid)) {
      rows.Firm.push({ id: fid, name: canonical, channel: "unknown" });
      seenFirms.add(fid);
    }
    rows.ArticleFirmMention.push({
      id: uid(`afm:${aid}:${fid}`),
      articleId: aid,
      firmId: fid,
    });
  }
  for (const match of body.matchAll(/\$([\d,.]+)\s*(billion|million)?/gi)) {
    rows.FieldAssertion.push({
      id: uid(`fa:${aid}:money:${match.index}`),
      articleId: aid,
      targetTable: "Article",
      targetId: aid,
      fieldName: "moneyMention",
      assertedValue: match[0],
      quotePhrase: match[0],
      confidence: "candidate",
    });
  }
}

for (const [table, tableRows] of Object.entries(rows)) {
  console.log(`  upsert ${table}: ${tableRows.length} (${await upsert(table, tableRows)} touched)`);
}
