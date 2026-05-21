#!/usr/bin/env node
// @ts-nocheck
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as cheerio from "cheerio";

function parseMoney(raw: string, unit = ""): number | null {
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  if (/^b/i.test(unit)) return value * 1_000_000_000;
  if (/^m/i.test(unit)) return value * 1_000_000;
  if (/^k$/i.test(unit)) return value * 1_000;
  return value;
}

export function extract(text: string): Record<string, unknown> {
  const moneyMentions = [...text.matchAll(/\$([\d,.]+)\s*(billion|million|k)?/gi)]
    .map(m => ({ value: parseMoney(m[1], m[2]), phrase: m[0] }))
    .filter(x => x.value);
  const firms = [
    "Morgan Stanley", "Merrill Lynch", "UBS", "Wells Fargo", "Rockefeller",
    "J.P. Morgan", "Goldman Sachs", "Stifel", "Raymond James", "LPL",
    "Ameriprise", "Edward Jones", "Cetera", "RBC", "First Republic",
    "Janney", "Hightower", "Beacon Pointe", "Focus Financial",
    "Steward Partners", "Stanford Financial", "Chelsea Financial",
  ];
  return {
    money_mentions: moneyMentions,
    pct_mentions: [...text.matchAll(/(\d{1,4}(?:\.\d+)?)\s*%/g)].map(m => m[0]),
    years_mentioned: [...new Set([...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m => m[0]))].sort(),
    tenure_phrases: [...text.matchAll(/(\d{1,2})-year (?:broker|veteran|advisor)/gi)].map(m => m[0]),
    candidate_names: [...new Set([...text.matchAll(/([A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?=[^.]*?\b(?:advisor|broker|registered|managing director|vice president)\b)/gi)].map(m => m[1]))].sort(),
    firms_mentioned: firms.filter(f => text.includes(f)).sort(),
    fines: [...text.matchAll(/fined\s+\$?([\d,]+)/gi)].map(m => m[0]),
    suspensions: [...text.matchAll(/suspend(?:ed)?\s+(?:for\s+)?(\w+|\d+)\s+(month|months|year|years)/gi)].map(m => m[0]),
  };
}

async function main(): Promise<void> {
  const out = process.argv[process.argv.indexOf("--out") + 1] || "research/extracted.jsonl";
  const dir = process.argv[process.argv.indexOf("--html-dir") + 1] || "research/articles";
  const lines: string[] = [];
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".html")) continue;
    const html = await readFile(join(dir, file), "utf8");
    const $ = cheerio.load(html);
    const text = $.text().replace(/\s+/g, " ").trim();
    lines.push(JSON.stringify({ file, ...extract(text) }));
  }
  await writeFile(out, `${lines.join("\n")}${lines.length ? "\n" : ""}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
