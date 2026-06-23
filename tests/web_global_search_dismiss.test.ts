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
  process.env.RUN_WEB_GLOBAL_SEARCH_DISMISS === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;

const SEARCH_RESULTS = [
  {
    kind: "advisor",
    id: "advisor-brian-morgan",
    name: "Brian Morgan",
    sub: "Morgan Stanley",
  },
  {
    kind: "firm",
    id: "firm-morgan-stanley",
    name: "Morgan Stanley",
    sub: "Wirehouse",
  },
  {
    kind: "advisor",
    id: "advisor-morgan-1",
    name: "Morgan Adams",
    sub: "Advisor",
  },
  {
    kind: "advisor",
    id: "advisor-morgan-2",
    name: "Morgan Baker",
    sub: "Advisor",
  },
  {
    kind: "advisor",
    id: "advisor-morgan-3",
    name: "Morgan Chen",
    sub: "Advisor",
  },
  {
    kind: "advisor",
    id: "advisor-morgan-4",
    name: "Morgan Diaz",
    sub: "Advisor",
  },
  {
    kind: "advisor",
    id: "advisor-morgan-5",
    name: "Morgan Ellis",
    sub: "Advisor",
  },
  {
    kind: "advisor",
    id: "advisor-morgan-6",
    name: "Morgan Frost",
    sub: "Advisor",
  },
  {
    kind: "advisor",
    id: "advisor-morgan-7",
    name: "Morgan Grant",
    sub: "Advisor",
  },
  {
    kind: "advisor",
    id: "advisor-morgan-8",
    name: "Morgan Hart",
    sub: "Advisor",
  },
] as const;
const WIDTHS = [390, 768, 1024] as const;
const SIGN_IN_CLICKS_KEY = "sign-in-clicks";

interface Point {
  readonly x: number;
  readonly y: number;
}

browserDescribe("global search outside-click dismissal", () => {
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

  it("lets the login submit control receive a click masked by search rows", async () => {
    const page = await browser.newPage();
    await routeAuth(page, false);
    await routeSearch(page);

    try {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#global-search", {
          timeout: QUICK_TIMEOUT,
        });
        await page.evaluate(clicksKey => {
          window.sessionStorage.setItem(clicksKey, "0");
          document
            .querySelector('button[type="submit"]')
            ?.addEventListener("click", () => {
              const current = Number(
                window.sessionStorage.getItem(clicksKey) || "0"
              );
              window.sessionStorage.setItem(clicksKey, String(current + 1));
            });
        }, SIGN_IN_CLICKS_KEY);

        await page.locator("#global-search").fill("morgan");
        await page.locator(".gs-item").first().waitFor({
          timeout: QUICK_TIMEOUT,
        });
        const buttonPoint = await centerOfSubmitButton(page);
        const beforeHit = await topElementDescription(page, buttonPoint);

        expect(beforeHit, `${width}px precondition`).toContain("gs-item");

        await page.mouse.click(buttonPoint.x, buttonPoint.y);

        expect(
          await page.locator("#global-search-results").isHidden(),
          `${width}px dropdown hidden`
        ).toBe(true);
        expect(page.url(), `${width}px stays on login`).toBe(
          `${baseUrl}/login`
        );
        expect(await signInClickCount(page), `${width}px submit clicked`).toBe(
          1
        );
      }
    } finally {
      await page.close();
    }
  });
});

/**
 * Routes global search to deterministic result rows.
 * @param page - Browser page under test.
 */
async function routeSearch(page: Page): Promise<void> {
  await page.route("**/Search**", async route => {
    await route.fulfill({
      json: {
        q: "morgan",
        items: SEARCH_RESULTS,
        counts: { advisors: 9, firms: 1, teams: 0, total: 10 },
      },
    });
  });
}

/**
 * Finds the center point of the sign-in submit button.
 * @param page - Browser page rendering `/login`.
 * @returns Viewport coordinates for hit testing.
 */
async function centerOfSubmitButton(page: Page): Promise<Point> {
  return await page.locator('button[type="submit"]').evaluate(button => {
    const box = button.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
}

/**
 * Describes the topmost element at a viewport point.
 * @param page - Browser page rendering `/login`.
 * @param point - Viewport coordinates to inspect.
 * @returns Element tag and class text.
 */
async function topElementDescription(
  page: Page,
  point: Point
): Promise<string> {
  return await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return element
      ? `${element.tagName.toLowerCase()}.${(element as HTMLElement).className}`
      : "";
  }, point);
}

/**
 * Reads the button click counter installed in session storage.
 * @param page - Browser page rendering `/login`.
 * @returns Number of button click events observed.
 */
async function signInClickCount(page: Page): Promise<number> {
  return await page.evaluate(
    clicksKey => Number(window.sessionStorage.getItem(clicksKey) || "0"),
    SIGN_IN_CLICKS_KEY
  );
}
