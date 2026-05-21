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
    console.log(`# ${title}\n\n${body}`);
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
