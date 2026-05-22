#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as cheerio from "cheerio";

const FIRM_NAMES = [
  "Morgan Stanley",
  "Merrill Lynch",
  "UBS",
  "Wells Fargo",
  "Rockefeller",
  "J.P. Morgan",
  "Goldman Sachs",
  "Stifel",
  "Raymond James",
  "LPL",
  "Ameriprise",
  "Edward Jones",
  "Cetera",
  "RBC",
  "First Republic",
  "Janney",
  "Hightower",
  "Beacon Pointe",
  "Focus Financial",
  "Steward Partners",
  "Stanford Financial",
  "Chelsea Financial",
] as const;

const ROLE_PATTERN =
  /\b(?:advisor|broker|registered|managing director|vice president)\b/i;
const NAME_PATTERN =
  /\b[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g;

/**
 * Returns strings in locale-aware alphabetical order.
 * @param values - Values to order for deterministic JSON output.
 * @returns A sorted copy of the supplied strings.
 */
function sortStrings(values: Iterable<string>): readonly string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

/**
 * Parses money from source data.
 * @param raw - Raw source payload.
 * @param unit - Optional magnitude label such as million, billion, or k.
 * @returns The mention value in whole dollars, or null when the number is invalid.
 */
function parseMoney(raw: string, unit = ""): number | null {
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  if (/^b/i.test(unit)) return value * 1_000_000_000;
  if (/^m/i.test(unit)) return value * 1_000_000;
  if (/^k$/i.test(unit)) return value * 1_000;
  return value;
}

/**
 * Extracts lightweight entities and numeric facts from saved article text.
 * @param text - Plain text article body.
 * @returns Candidate facts used for manual data enrichment.
 */
export function extract(text: string): Record<string, unknown> {
  const moneyMentions = [
    ...text.matchAll(/\$([\d,.]+)\s*(billion|million|k)?/gi),
  ]
    .map(m => ({ value: parseMoney(m[1], m[2]), phrase: m[0] }))
    .filter(x => x.value);
  const sentencesWithRoles = text
    .split(/[.!?]\s+/)
    .filter(sentence => ROLE_PATTERN.test(sentence));
  const candidateNames = new Set(
    sentencesWithRoles.flatMap(sentence =>
      [...sentence.matchAll(NAME_PATTERN)].map(m => m[0])
    )
  );

  return {
    money_mentions: moneyMentions,
    pct_mentions: [...text.matchAll(/(\d{1,4}(?:\.\d+)?)\s*%/g)].map(m => m[0]),
    years_mentioned: sortStrings(
      new Set([...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m => m[0]))
    ),
    tenure_phrases: [
      ...text.matchAll(/(\d{1,2})-year (?:broker|veteran|advisor)/gi),
    ].map(m => m[0]),
    candidate_names: sortStrings(candidateNames),
    firms_mentioned: sortStrings(FIRM_NAMES.filter(f => text.includes(f))),
    fines: [...text.matchAll(/fined\s+\$?([\d,]+)/gi)].map(m => m[0]),
    suspensions: [
      ...text.matchAll(
        /suspend(?:ed)?\s+(?:for\s+)?(\w+|\d+)\s+(month|months|year|years)/gi
      ),
    ].map(m => m[0]),
  };
}

/**
 * Extracts article facts from an HTML directory into a JSONL file.
 */
async function main(): Promise<void> {
  const out =
    process.argv[process.argv.indexOf("--out") + 1] ||
    "research/extracted.jsonl";
  const dir =
    process.argv[process.argv.indexOf("--html-dir") + 1] || "research/articles";
  const files = await readdir(dir);
  const lines = await Promise.all(
    files
      .filter(file => file.endsWith(".html"))
      .map(async file => {
        const html = await readFile(join(dir, file), "utf8");
        const $ = cheerio.load(html);
        const text = $.text().replace(/\s+/g, " ").trim();
        return JSON.stringify({ file, ...extract(text) });
      })
  );
  await writeFile(out, `${lines.join("\n")}${lines.length ? "\n" : ""}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
