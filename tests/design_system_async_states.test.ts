import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ASYNC_STATE_FALLBACKS,
  AsyncStateNotice,
  LoadingState,
  resolveAsyncStateFallback,
} from "../src/web/design-system/index";

const WEB_ROOT = resolve("harper-app/web");
const browserDescribe = existsSync(chromium.executablePath())
  ? describe.sequential
  : describe.skip;

describe("design-system async state patterns", () => {
  it("exports reusable async state helpers through the public barrel", () => {
    expect(typeof LoadingState).toBe("function");
    expect(typeof AsyncStateNotice).toBe("function");
    expect(typeof resolveAsyncStateFallback).toBe("function");
  });

  it("preserves the PRD fallback behavior table", () => {
    expect(ASYNC_STATE_FALLBACKS).toMatchObject({
      error: {
        messageIntent: "We couldn't load this right now.",
        primaryAction: "Retry the failed request",
        retryRule: "required",
      },
      empty: {
        messageIntent: "No results are available yet.",
        primaryAction: "Refresh or adjust search/filter if one exists",
        retryRule: "optional-refresh",
      },
      notFound: {
        messageIntent: "This item could not be found.",
        primaryAction: "Return to the feed or previous navigable surface",
        retryRule: "never",
      },
      permission: {
        messageIntent:
          "You don't have access to this content. Sign in again to continue.",
        primaryAction: "Sign in again or return to a safe surface",
        retryRule: "no-automatic-retry",
      },
      partial: {
        messageIntent: "Some details couldn't be loaded.",
        primaryAction: "Retry the affected section when practical",
        retryRule: "section-only",
      },
    });
  });

  it("allows local copy refinement without changing the canonical behavior", () => {
    const fallback = resolveAsyncStateFallback("error", {
      title: "Could not load feed",
      actionLabel: "Try again",
    });

    expect(fallback).toMatchObject({
      kind: "error",
      title: "Could not load feed",
      actionLabel: "Try again",
      messageIntent: "We couldn't load this right now.",
      retryRule: "required",
    });
    expect(ASYNC_STATE_FALLBACKS.error.title).toBe("Could not load");
  });
});

browserDescribe("design-system generated async states", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("renders canonical cards and inline statuses from the generated barrel export", async () => {
    const page = await browser.newPage();

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({
      type: "module",
      content: `
        import * as ui from "/design-system/index.js";
        let retryCount = 0;
        const card = ui.AsyncStateCard({
          kind: "partial",
          actionLabel: "Retry section",
          onAction: () => {
            retryCount += 1;
          },
        });
        const loading = ui.InlineStatus({ kind: "loading" });
        const error = ui.InlineStatus({
          kind: "error",
          children: "Could not load matches",
        });

        document.body.append(card, loading, error);
        card.querySelector("button")?.dispatchEvent(new MouseEvent("click"));

        window.__asyncStateResult = {
          cardClass: card.className,
          title: card.querySelector(".card-title")?.textContent,
          body: card.querySelector(".ab-async-state-body")?.textContent,
          buttonText: card.querySelector("button")?.textContent,
          loadingRole: loading.getAttribute("role"),
          loadingLive: loading.getAttribute("aria-live"),
          errorRole: error.getAttribute("role"),
          errorText: error.textContent,
          retryCount,
        };
      `,
    });
    await page.waitForFunction(() => "__asyncStateResult" in window);
    const result = await page.evaluate(
      () =>
        (window as typeof window & { __asyncStateResult: unknown })
          .__asyncStateResult
    );

    expect(result).toEqual({
      cardClass: "card ab-async-state ab-async-state--partial",
      title: "Some details are unavailable",
      body: "The main record loaded, but one supporting section failed.",
      buttonText: "Retry section",
      loadingRole: "status",
      loadingLive: "polite",
      errorRole: "alert",
      errorText: "Could not load matches",
      retryCount: 1,
    });
    await page.close();
  });
});

/**
 * Starts a static server rooted at generated web assets.
 * @returns Local static server for browser tests.
 */
async function startStaticServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const urlPath = request.url?.split("?")[0] || "/";
    if (urlPath === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><html><body></body></html>");
      return;
    }

    const resolvedPath = resolveStaticPath(urlPath);
    try {
      response.writeHead(200, { "Content-Type": contentType(resolvedPath) });
      response.end(await readFile(resolvedPath));
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
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
 * Resolves a request path to a generated asset path.
 * @param urlPath - Request URL path.
 * @returns Absolute static file path.
 */
function resolveStaticPath(urlPath: string): string {
  const cleanPath = normalize(decodeURIComponent(urlPath)).replace(
    /^(\.\.(\/|\\|$))+/,
    ""
  );
  const relativePath = cleanPath.replace(/^[/\\]+/, "");
  const candidate = resolve(WEB_ROOT, relativePath);
  if (!candidate.startsWith(`${WEB_ROOT}${sep}`) && candidate !== WEB_ROOT) {
    return join(WEB_ROOT, "404.html");
  }
  return candidate;
}

/**
 * Maps static file extensions to browser content types.
 * @param filePath - Static file path.
 * @returns HTTP content type.
 */
function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
