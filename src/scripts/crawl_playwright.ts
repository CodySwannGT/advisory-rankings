#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const out: string =
  process.argv[process.argv.indexOf("--out") + 1] || "research/html";
const sleepSeconds: number = Number(
  process.argv[process.argv.indexOf("--sleep") + 1] || "5"
);
const urlsFile: string =
  process.argv.find(
    (arg: string): boolean =>
      !arg.startsWith("--") &&
      arg !== process.argv[0] &&
      arg !== process.argv[1]
  ) ?? "urls.txt";

await mkdir(out, { recursive: true });
const urls: readonly string[] = (await readFile(urlsFile, "utf8"))
  .split(/\r?\n/)
  .map((x: string): string => x.trim())
  .filter(Boolean);
const browser: Browser = await chromium.launch({ headless: true });
try {
  const page: Page = await browser.newPage();
  for (const url of urls) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const html: string = await page.content();
    const name: string =
      basename(new URL(url).pathname.replace(/\/$/, "")) ||
      encodeURIComponent(url);
    await writeFile(join(out, `${name}.html`), html);
    console.error(`[playwright] ${url}`);
    await page.waitForTimeout(sleepSeconds * 1000);
  }
} finally {
  await browser.close();
}
