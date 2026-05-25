import { describe, expect, it } from "vitest";

import advisorsRoutes from "../harper-app/advisors/index.js";
import articlesRoutes from "../harper-app/articles/index.js";
import firmsRoutes from "../harper-app/firms/index.js";
import recruitingRoutes from "../harper-app/recruiting/index.js";
import teamsRoutes from "../harper-app/teams/index.js";

describe("SEO route shells", () => {
  it("registers explicit entity routes without catching root assets", async () => {
    const paths: string[] = [];
    const fastify = { get: (path: string) => paths.push(path) };

    await firmsRoutes(fastify);
    await recruitingRoutes(fastify);
    await advisorsRoutes(fastify);
    await teamsRoutes(fastify);
    await articlesRoutes(fastify);

    expect(paths).toEqual([
      "/firms",
      "/firms/:slug",
      "/recruiting",
      "/advisors",
      "/advisors/:slug",
      "/teams",
      "/teams/:slug",
      "/articles/:slug",
    ]);
    expect(paths).not.toContain("/");
    expect(paths).not.toContain("/:slug");
  });
});
