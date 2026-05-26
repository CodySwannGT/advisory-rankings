import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("regulatory source-built page", () => {
  it("keeps the HTML shell thin and loads generated page JavaScript", async () => {
    const html = await readFile("harper-app/web/regulatory.html", "utf8");

    expect(html).toContain('src="/regulatory.js?v=20260521-media"');
    expect(html).not.toContain('api("/Feed")');
    expect(html).not.toContain("DisclosureEventCard");
  });

  it("keeps compliance behavior in TypeScript source", async () => {
    const source = await readFile("src/web/regulatory.ts", "utf8");

    expect(source).toContain('api("/Feed")');
    expect(source).toContain("DisclosureEventCard");
    expect(source).toContain("Could not load compliance events");
  });
});
