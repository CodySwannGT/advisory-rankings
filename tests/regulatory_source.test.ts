import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const trackedWebShells = [
  "advisor.html",
  "advisors.html",
  "article.html",
  "firm.html",
  "firms.html",
  "index.html",
  "login.html",
  "rankings.html",
  "recruiting.html",
  "regulatory.html",
  "team.html",
  "teams.html",
  "watchlists.html",
] as const;

describe("regulatory source-built page", () => {
  it("keeps the HTML shell thin and loads generated page JavaScript", async () => {
    const html = await readFile("harper-app/web/regulatory.html", "utf8");

    expect(html).toContain('src="/regulatory.js"');
    expect(html).not.toContain("?v=");
    expect(html).not.toContain('api("/Feed")');
    expect(html).not.toContain("DisclosureEventCard");
  });

  it("keeps compliance behavior in TypeScript source", async () => {
    const source = await readFile("src/web/regulatory.ts", "utf8");

    expect(source).toContain('api("/Feed")');
    expect(source).toContain("DisclosureEventCard");
    expect(source).toContain("Could not load compliance events");
  });

  it("keeps Harper static asset URLs query-free", async () => {
    const shellContents = await Promise.all(
      trackedWebShells.map(async shell => [
        shell,
        await readFile(`harper-app/web/${shell}`, "utf8"),
      ])
    );
    const css = await readFile("harper-app/web/app.css", "utf8");

    for (const [shell, html] of shellContents) {
      expect(html, shell).not.toContain("?v=");
    }
    expect(css, "app.css").not.toContain("?v=");
  });
});
