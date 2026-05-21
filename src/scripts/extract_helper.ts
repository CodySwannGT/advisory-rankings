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

async function* wpjsonRecords(): AsyncGenerator<[number, string]> {
  for (const root of [WPJSON_DIR, SAMPLES_DIR]) {
    if (!existsSync(root)) continue;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        for (const file of await readdir(join(root, entry.name))) {
          const match = file.match(/^post_(\d+)\.json$/);
          if (match) yield [Number(match[1]), join(root, entry.name, file)];
        }
      } else if (entry.name.endsWith(".wpjson.json")) {
        const path = join(root, entry.name);
        const raw = JSON.parse(await readFile(path, "utf8"));
        if (raw.id) yield [Number(raw.id), path];
      }
    }
  }
}

function extractedPath(wpId: number): string {
  return join(EXTRACT_DIR, `${wpId}.json`);
}

function imageUrls(raw: any): string[] {
  const urls = new Set<string>();
  const embedded = raw?._embedded?.["wp:featuredmedia"] ?? [];
  for (const media of embedded) {
    if (media?.source_url) urls.add(media.source_url);
    for (const size of Object.values(media?.media_details?.sizes ?? {})) {
      if ((size as any)?.source_url) urls.add((size as any).source_url);
    }
  }
  const $ = cheerio.load(raw?.content?.rendered ?? "");
  $("img").each((_, element) => {
    const src = $(element).attr("src") ?? $(element).attr("data-src");
    if (src) urls.add(src);
  });
  return [...urls];
}

async function findPending(): Promise<void> {
  await mkdir(EXTRACT_DIR, { recursive: true });
  for await (const [wpId, source] of wpjsonRecords()) {
    if (!existsSync(extractedPath(wpId)) && !existsSync(join(LOADED_DIR, `${wpId}.json`))) {
      console.log(`${wpId}\t${source}\t${extractedPath(wpId)}`);
    }
  }
}

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
  if (existsSync(LOADED_DIR)) console.log((await readdir(LOADED_DIR)).join("\n"));
} else {
  throw new Error("usage: extract_helper find-pending | show <wpid> | list-loaded");
}
