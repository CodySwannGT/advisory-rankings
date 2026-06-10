import { existsSync } from "node:fs";
import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  QUICK_TIMEOUT,
  routeAuth,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const browserDescribe =
  process.env.RUN_WEB_TABLET_HEADER === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;

const ROUTES = [
  "/",
  "/firms",
  "/recruiting",
  "/rankings",
  "/advisors",
  "/teams",
  "/watchlists",
  "/regulatory",
  "/login",
] as const;
const WIDTHS = [768, 900, 1280] as const;
const SEARCH_KIND_SELECTOR = ".gs-kind-controls .gs-kind-toggle";

interface TabletHeaderMetrics {
  readonly burgerVisible: boolean;
  readonly clientWidth: number;
  readonly separated: boolean;
  readonly searchWidth: number;
  readonly scrollWidth: number;
  readonly textFits: boolean;
  readonly visibleCount: number;
}

browserDescribe("tablet header layout", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    baseUrl = baseUrlOf(server);
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("keeps global search controls readable without overflow", async () => {
    const page = await browser.newPage();
    await routeAuth(page, false);

    try {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of ROUTES) {
          await page.goto(`${baseUrl}${route}`, {
            waitUntil: "domcontentloaded",
          });
          await page.waitForSelector(".nav", { timeout: QUICK_TIMEOUT });
          const metrics = await tabletHeaderMetrics(page);

          expect(metrics.burgerVisible, `${width}px ${route}`).toBe(true);
          expect(
            metrics.scrollWidth,
            `${width}px ${route}`
          ).toBeLessThanOrEqual(metrics.clientWidth);
          expect(metrics.visibleCount, `${width}px ${route}`).toBe(4);
          expect(metrics.separated, `${width}px ${route}`).toBe(true);
          expect(metrics.textFits, `${width}px ${route}`).toBe(true);
          expect(
            metrics.searchWidth,
            `${width}px ${route}`
          ).toBeGreaterThanOrEqual(280);
        }
      }
    } finally {
      await page.close();
    }
  });
});

/**
 * Reads rendered header metrics for tablet-width overlap assertions.
 * @param page - Browser page rendering a public shell.
 * @returns Header layout metrics.
 */
async function tabletHeaderMetrics(page: Page): Promise<TabletHeaderMetrics> {
  return await page.evaluate(selector => {
    const boxes = [...document.querySelectorAll(selector)].map(button =>
      button.getBoundingClientRect()
    );
    const textFits = [...document.querySelectorAll(selector)].every(button => {
      if (!(button instanceof HTMLElement)) return false;
      return button.scrollWidth <= button.clientWidth;
    });
    const searchBox = document
      .querySelector(".nav .search")
      ?.getBoundingClientRect();
    const burger = document.querySelector(".nav-burger");
    return {
      burgerVisible: burger
        ? getComputedStyle(burger).display !== "none"
        : false,
      clientWidth: document.documentElement.clientWidth,
      separated: boxes.every((box, index) => {
        const previous = boxes[index - 1];
        return !previous || previous.right <= box.left;
      }),
      searchWidth: searchBox?.width ?? 0,
      scrollWidth: document.documentElement.scrollWidth,
      textFits,
      visibleCount: boxes.filter(box => box.width >= 36).length,
    };
  }, SEARCH_KIND_SELECTOR);
}
