#!/usr/bin/env node
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import {
  assertRecruitingMarketVerification,
  recruitingMarketFilterPaths,
  recruitingRoutePath,
  summarizeRecruitingMarketPayload,
  type RecruitingBrowserEvidence,
  type RecruitingFilterEvidence,
  type RecruitingMarketVerificationEvidence,
} from "../lib/recruiting-market-verification.js";

const DEFAULT_DATA_BASE_URL =
  "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const DEFAULT_ARTIFACT_BASE =
  "tests/screenshots/recruiting-market-verification";
const WEB_ROOT = resolve("harper-app/web");
const MIME_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;
const DEPLOYED_DATA_TIMEOUT_MS = 60000;

/** Normalized command-line options for Recruiting Market verification. */
interface VerifyRecruitingMarketOptions {
  readonly artifactBase: string;
  readonly dataBaseUrl: string;
}

/**
 * Captures replayable API and browser evidence for Recruiting Market.
 * @param options - Target backend and artifact location.
 * @returns Evidence written to disk.
 */
export async function verifyRecruitingMarket(
  options: VerifyRecruitingMarketOptions
): Promise<RecruitingMarketVerificationEvidence> {
  const dataBaseUrl = stripTrailingSlashes(options.dataBaseUrl);
  const artifactBase = options.artifactBase;
  const defaultPayload = await fetchRecruitingPayload(
    dataBaseUrl,
    "/RecruitingMarket?limit=25"
  );
  const filters = await captureFilterEvidence(dataBaseUrl, defaultPayload);
  const server = await startStaticProxyServer(dataBaseUrl);
  const localUrl = localServerUrl(server);
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const browserEvidence = await captureBrowserEvidence(
        browser,
        localUrl,
        artifactBase
      );
      const evidence: RecruitingMarketVerificationEvidence = {
        browser: browserEvidence,
        capturedAt: new Date().toISOString(),
        dataBaseUrl,
        defaultResource: summarizeRecruitingMarketPayload(defaultPayload),
        filters,
        localUrl,
      };
      assertRecruitingMarketVerification(evidence);
      await writeJson(`${artifactBase}.json`, evidence);
      return evidence;
    } finally {
      await browser.close();
    }
  } finally {
    await closeServer(server);
  }
}

/**
 * Captures non-empty filtered API slices for reviewer replay.
 * @param dataBaseUrl - Deployed data/backend origin.
 * @param defaultPayload - Default RecruitingMarket payload.
 * @returns Filtered evidence rows.
 */
async function captureFilterEvidence(
  dataBaseUrl: string,
  defaultPayload: unknown
): Promise<readonly RecruitingFilterEvidence[]> {
  return await Promise.all(
    recruitingMarketFilterPaths(defaultPayload).map(async path => {
      const payload = await fetchRecruitingPayload(dataBaseUrl, path);
      const summary = summarizeRecruitingMarketPayload(payload);
      return {
        label: recruitingRoutePath(path),
        path,
        recentMoveCount: summary.recentMoveCount,
        marketActivityCount: summary.marketActivityCount,
      };
    })
  );
}

/**
 * Captures rendered desktop and mobile Recruiting evidence.
 * @param browser - Playwright browser.
 * @param localUrl - Local static/proxy server origin.
 * @param artifactBase - Base path for output artifacts.
 * @returns Browser evidence rows.
 */
async function captureBrowserEvidence(
  browser: Browser,
  localUrl: string,
  artifactBase: string
): Promise<readonly RecruitingBrowserEvidence[]> {
  return await VIEWPORTS.reduce(
    async (previous, viewport) => [
      ...(await previous),
      await captureViewportEvidence(browser, localUrl, artifactBase, viewport),
    ],
    Promise.resolve([] as readonly RecruitingBrowserEvidence[])
  );
}

/**
 * Captures rendered Recruiting evidence for one viewport.
 * @param browser - Playwright browser.
 * @param localUrl - Local static/proxy server origin.
 * @param artifactBase - Base path for output artifacts.
 * @param viewport - Viewport descriptor.
 * @returns Browser evidence row.
 */
async function captureViewportEvidence(
  browser: Browser,
  localUrl: string,
  artifactBase: string,
  viewport: (typeof VIEWPORTS)[number]
): Promise<RecruitingBrowserEvidence> {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });
  try {
    await page.goto(`${localUrl}/recruiting`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".recruiting-table", {
      timeout: DEPLOYED_DATA_TIMEOUT_MS,
    });
    const screenshot =
      viewport.name === "desktop"
        ? `${artifactBase}.png`
        : `${artifactBase}-${viewport.name}.png`;
    await page.screenshot({ fullPage: true, path: screenshot });
    return await readBrowserEvidence(page, viewport.name, screenshot);
  } finally {
    await page.close();
  }
}

/**
 * Reads compact DOM evidence from one rendered page.
 * @param page - Recruiting route page.
 * @param viewport - Viewport label.
 * @param screenshot - Screenshot artifact path.
 * @returns Browser evidence row.
 */
async function readBrowserEvidence(
  page: Page,
  viewport: "desktop" | "mobile",
  screenshot: string
): Promise<RecruitingBrowserEvidence> {
  const evidence = await page.evaluate(() => {
    const sourceCards = [...document.querySelectorAll(".card")]
      .filter(card => card.textContent?.includes("Source"))
      .map(card => card.textContent?.replace(/\s+/g, " ").trim() ?? "");
    const headerText =
      document.querySelector(".recruiting-header")?.textContent ?? "";
    return {
      sourceStatusText: sourceCards.join(" "),
      summaryText: headerText.replace(/\s+/g, " ").trim(),
      tableCount: document.querySelectorAll(".recruiting-table").length,
    };
  });
  return { ...evidence, screenshot, viewport };
}

/**
 * Starts a local server that serves generated web assets and proxies data.
 * @param dataBaseUrl - Backend origin for `/RecruitingMarket`.
 * @returns Listening HTTP server.
 */
async function startStaticProxyServer(dataBaseUrl: string): Promise<Server> {
  const server = createServer((req, res) => {
    void handleRequest(dataBaseUrl, req, res);
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return server;
}

/**
 * Routes one local verification HTTP request.
 * @param dataBaseUrl - Backend origin for proxied resources.
 * @param req - Incoming request.
 * @param res - Outgoing response.
 */
async function handleRequest(
  dataBaseUrl: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/RecruitingMarket") {
    await proxyRecruitingMarket(dataBaseUrl, url, res);
    return;
  }
  await serveStaticFile(url.pathname, res);
}

/**
 * Proxies a RecruitingMarket resource request to the target backend.
 * @param dataBaseUrl - Backend origin.
 * @param url - Local request URL.
 * @param res - Outgoing response.
 */
async function proxyRecruitingMarket(
  dataBaseUrl: string,
  url: URL,
  res: ServerResponse
): Promise<void> {
  const target = `${dataBaseUrl}/RecruitingMarket${url.search}`;
  const response = await fetch(target, {
    headers: { Accept: "application/json" },
  });
  const body = await response.text();
  res.writeHead(response.status, {
    "content-type": response.headers.get("content-type") ?? "application/json",
  });
  res.end(body);
}

/**
 * Serves generated web assets for the Recruiting route.
 * @param pathname - Request path.
 * @param res - Outgoing response.
 */
async function serveStaticFile(
  pathname: string,
  res: ServerResponse
): Promise<void> {
  const filePath = staticFilePath(pathname);
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type":
        MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

/**
 * Maps route paths to generated web asset paths.
 * @param pathname - Browser request path.
 * @returns Absolute file path under `harper-app/web`.
 */
function staticFilePath(pathname: string): string {
  if (pathname === "/" || pathname === "/recruiting") {
    return join(WEB_ROOT, "recruiting.html");
  }
  return join(WEB_ROOT, pathname.replace(/^\/+/, ""));
}

/**
 * Fetches JSON from one RecruitingMarket path.
 * @param dataBaseUrl - Backend origin.
 * @param path - Resource path with query string.
 * @returns Decoded JSON payload.
 */
async function fetchRecruitingPayload(
  dataBaseUrl: string,
  path: string
): Promise<unknown> {
  const response = await fetch(`${dataBaseUrl}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return await response.json();
}

/**
 * Writes pretty JSON after creating the artifact directory.
 * @param path - Output file path.
 * @param value - JSON value.
 */
async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Returns the local server origin.
 * @param server - Listening server.
 * @returns HTTP origin.
 */
function localServerUrl(server: Server): string {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Verification server did not expose a TCP address");
  }
  return `http://127.0.0.1:${address.port}`;
}

/**
 * Closes a listening HTTP server.
 * @param server - Server to close.
 */
async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close(error => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

/**
 * Removes trailing slashes from a URL string.
 * @param value - Raw URL.
 * @returns URL without trailing slashes.
 */
function stripTrailingSlashes(value: string): string {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyRecruitingMarket({
    artifactBase: process.env.ARTIFACT_BASE ?? DEFAULT_ARTIFACT_BASE,
    dataBaseUrl: process.env.DATA_BASE_URL ?? DEFAULT_DATA_BASE_URL,
  })
    .then(evidence => {
      console.log(
        JSON.stringify(
          {
            artifact: `${process.env.ARTIFACT_BASE ?? DEFAULT_ARTIFACT_BASE}.json`,
            browser: evidence.browser,
            defaultResource: evidence.defaultResource,
            filters: evidence.filters,
          },
          null,
          2
        )
      );
    })
    .catch(error => {
      console.error(error instanceof Error ? error.stack : String(error));
      process.exitCode = 1;
    });
}
