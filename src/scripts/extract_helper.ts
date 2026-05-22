#!/usr/bin/env node
// @ts-nocheck
import { mkdir, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as cheerio from "cheerio";

const WPJSON_DIR = "research/wpjson";
const SAMPLES_DIR = "research/articles";
const EXTRACT_DIR = "research/extractions";
const LOADED_DIR = join(EXTRACT_DIR, ".loaded");

/**
 * Handles wpjson records for this workflow.
 * @returns The computed value.
 */
async function* wpjsonRecords(): AsyncGenerator<readonly [number, string]> {
  for (const root of [WPJSON_DIR, SAMPLES_DIR]) {
    if (!existsSync(root)) continue;
    yield* recordsForRoot(root);
  }
}

/**
 * Finds WordPress JSON records under one research directory.
 * @param root - Research directory to inspect.
 * @returns Async stream of WordPress IDs and source paths.
 */
async function* recordsForRoot(
  root: string
): AsyncGenerator<readonly [number, string]> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) yield* recordsForPostDirectory(root, entry.name);
    else if (entry.name.endsWith(".wpjson.json"))
      yield* recordForWpJsonFile(root, entry.name);
  }
}

/**
 * Reads saved post_<id>.json files from a crawl subdirectory.
 * @param root - Research directory root.
 * @param entryName - Crawl subdirectory name.
 * @returns Async stream of WordPress IDs and source paths.
 */
async function* recordsForPostDirectory(
  root: string,
  entryName: string
): AsyncGenerator<readonly [number, string]> {
  for (const file of await readdir(join(root, entryName))) {
    const match = /^post_(\d+)\.json$/.exec(file);
    if (match) yield [Number(match[1]), join(root, entryName, file)];
  }
}

/**
 * Reads a single exported WordPress JSON file when it contains a post ID.
 * @param root - Research directory root.
 * @param entryName - JSON filename.
 * @returns Async stream containing the file record when it has an ID.
 */
async function* recordForWpJsonFile(
  root: string,
  entryName: string
): AsyncGenerator<readonly [number, string]> {
  const path = join(root, entryName);
  const raw = JSON.parse(await readFile(path, "utf8"));
  if (raw.id) yield [Number(raw.id), path];
}

/**
 * Handles extracted path for this workflow.
 * @param wpId - WordPress post id.
 * @returns The computed value.
 */
function extractedPath(wpId: number): string {
  return join(EXTRACT_DIR, `${wpId}.json`);
}

/**
 * Handles image urls for this workflow.
 * @param raw - Raw source payload.
 * @returns Candidate image URLs from featured media and article markup.
 */
function imageUrls(raw: Record<string, unknown>): readonly string[] {
  const embedded = raw?._embedded?.["wp:featuredmedia"] ?? [];
  const mediaUrls = embedded
    .flatMap(media => [
      media?.source_url,
      ...Object.values(media?.media_details?.sizes ?? {}).map(
        size => (size as Record<string, unknown>)?.source_url
      ),
    ])
    .filter(Boolean);
  const $ = cheerio.load(raw?.content?.rendered ?? "");
  const markupUrls = $("img")
    .toArray()
    .map(element => $(element).attr("src") ?? $(element).attr("data-src"))
    .filter(Boolean);
  return [...new Set([...mediaUrls, ...markupUrls])];
}

/**
 * Handles find pending for this workflow.
 * @returns Resolves after printing pending extraction rows.
 */
async function findPending(): Promise<void> {
  await mkdir(EXTRACT_DIR, { recursive: true });
  for await (const [wpId, source] of wpjsonRecords()) {
    if (
      !existsSync(extractedPath(wpId)) &&
      !existsSync(join(LOADED_DIR, `${wpId}.json`))
    ) {
      console.log(`${wpId}\t${source}\t${extractedPath(wpId)}`);
    }
  }
}

/**
 * Prints a saved WordPress article as markdown-like text for manual extraction.
 * @param wpId - WordPress post id.
 * @returns Resolves after printing the article.
 */
async function show(wpId: string): Promise<void> {
  for await (const [id, source] of wpjsonRecords()) {
    if (String(id) !== wpId) continue;
    const raw = JSON.parse(await readFile(source, "utf8"));
    const title = cheerio.load(raw.title?.rendered ?? "").text();
    const body = cheerio.load(raw.content?.rendered ?? "").text();
    const images = imageUrls(raw);
    const imageBlock = images.length
      ? `\n\n## Candidate image URLs\n\n${images.map(url => `- ${url}`).join("\n")}`
      : "";
    console.log(`# ${title}\n\n${body}${imageBlock}`);
    return;
  }
  throw new Error(`wpId not found: ${wpId}`);
}

const cmd = process.argv[2];
if (cmd === "find-pending") await findPending();
else if (cmd === "show") await show(process.argv[3]);
else if (cmd === "list-loaded") {
  if (existsSync(LOADED_DIR))
    console.log((await readdir(LOADED_DIR)).join("\n"));
} else {
  throw new Error(
    "usage: extract_helper find-pending | show <wpid> | list-loaded"
  );
}
