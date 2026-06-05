import { describe, expect, it } from "vitest";

import advisorsRoutes from "../harper-app/advisors/index.js";
import articlesRoutes from "../harper-app/articles/index.js";
import firmsRoutes from "../harper-app/firms/index.js";
import loginRoutes from "../harper-app/login/index.js";
import recruitingRoutes from "../harper-app/recruiting/index.js";
import regulatoryRoutes from "../harper-app/regulatory/index.js";
import teamsRoutes from "../harper-app/teams/index.js";

type RouteHandler = (request: unknown, reply: unknown) => unknown;

describe("SEO route shells", () => {
  it("registers explicit entity routes without catching root assets", async () => {
    const paths: string[] = [];
    const fastify = { get: (path: string) => paths.push(path) };

    await firmsRoutes(fastify);
    await recruitingRoutes(fastify);
    await advisorsRoutes(fastify);
    await teamsRoutes(fastify);
    await articlesRoutes(fastify);
    await regulatoryRoutes(fastify);
    await loginRoutes(fastify);

    expect(paths).toEqual([
      "/firms",
      "/firms/:slug",
      "/recruiting",
      "/advisors",
      "/advisors/:slug",
      "/teams",
      "/teams/:slug",
      "/articles/:slug",
      "/regulatory",
      "/login",
      "/login.html",
    ]);
    expect(paths).not.toContain("/");
    expect(paths).not.toContain("/:slug");
  });

  it("keeps legacy login bookmarks on the clean route", async () => {
    const handlers = new Map<string, RouteHandler>();
    const fastify = {
      get: (path: string, handler: RouteHandler) => handlers.set(path, handler),
    };
    const redirects: Array<[number, string]> = [];
    const reply = {
      redirect: (statusCode: number, path: string) => {
        redirects.push([statusCode, path]);
      },
    };

    await loginRoutes(fastify);
    await handlers.get("/login.html")?.({}, reply);

    expect(handlers.has("/login")).toBe(true);
    expect(redirects).toEqual([[302, "/login"]]);
  });
});
