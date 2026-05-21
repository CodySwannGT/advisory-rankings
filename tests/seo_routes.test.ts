import { describe, expect, it } from "vitest";

import advisorsRoutes from "../harper-app/advisors/index.js";
import firmsRoutes from "../harper-app/firms/index.js";
import teamsRoutes from "../harper-app/teams/index.js";

describe("SEO route shells", () => {
  it("registers explicit entity routes without catching root assets", async () => {
    const paths: string[] = [];
    const fastify = { get: (path: string) => paths.push(path) };

    await firmsRoutes(fastify);
    await advisorsRoutes(fastify);
    await teamsRoutes(fastify);

    expect(paths).toEqual([
      "/firms",
      "/firms/:slug",
      "/advisors",
      "/advisors/:slug",
      "/teams",
      "/teams/:slug",
    ]);
    expect(paths).not.toContain("/");
    expect(paths).not.toContain("/:slug");
  });
});
