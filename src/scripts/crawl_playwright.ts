#!/usr/bin/env node
// @ts-nocheck
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { chromium } from "playwright";

const out = process.argv[process.argv.indexOf("--out") + 1] || "research/html";
const sleepSeconds = Number(process.argv[process.argv.indexOf("--sleep") + 1] || "5");
const urlsFile = process.argv.find(arg => !arg.startsWith("--") && arg !== process.argv[0] && arg !== process.argv[1]) ?? "urls.txt";

await mkdir(out, { recursive: true });
const urls = (await readFile(urlsFile, "utf8")).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const url of urls) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const html = await page.content();
    const name = basename(new URL(url).pathname.replace(/\/$/, "")) || encodeURIComponent(url);
    await writeFile(join(out, `${name}.html`), html);
    console.error(`[playwright] ${url}`);
    await page.waitForTimeout(sleepSeconds * 1000);
  }
} finally {
  await browser.close();
}
