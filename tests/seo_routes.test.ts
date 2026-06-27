import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import advisorsRoutes from "../harper-app/advisors/index.js";
import articlesRoutes from "../harper-app/articles/index.js";
import branchesRoutes from "../harper-app/branches/index.js";
import firmsRoutes from "../harper-app/firms/index.js";
import loginRoutes from "../harper-app/login/index.js";
import recruitingDealGapRoutes from "../harper-app/recruiting-deal-gaps/index.js";
import recruitingRoutes from "../harper-app/recruiting/index.js";
import regulatoryRoutes from "../harper-app/regulatory/index.js";
import staticWebRoutes from "../harper-app/static-web/index.js";
import teamsRoutes from "../harper-app/teams/index.js";

type RouteHandler = (request: unknown, reply: unknown) => unknown;

const UNKNOWN_ROUTE_PATTERN = "*";

describe("SEO route shells", () => {
  it("registers explicit entity routes without catching root assets", async () => {
    const paths: string[] = [];
    const fastify = { get: (path: string) => paths.push(path) };

    await branchesRoutes(fastify);
    await firmsRoutes(fastify);
    await recruitingRoutes(fastify);
    await recruitingDealGapRoutes(fastify);
    await advisorsRoutes(fastify);
    await teamsRoutes(fastify);
    await articlesRoutes(fastify);
    await regulatoryRoutes(fastify);
    await loginRoutes(fastify);

    expect(paths).toEqual([
      "/branches",
      "/firms",
      "/firms/:slug",
      "/recruiting",
      "/recruiting/deal-gaps",
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
      redirect: (path: string, statusCode: number) => {
        redirects.push([statusCode, path]);
      },
    };

    await loginRoutes(fastify);
    await handlers.get("/login.html")?.({}, reply);

    expect(handlers.has("/login")).toBe(true);
    expect(redirects).toEqual([[302, "/login"]]);
  });
});

describe("static web route shells", () => {
  it("keeps Harper static serving on the deploy-safe wildcard mode", async () => {
    const config = await readFile("harper-app/config.yaml", "utf8");

    expect(config).toContain("static:");
    expect(config).toContain("files: 'web/**'");
    expect(config).not.toContain("wildcard: false");
  });

  it("registers root web assets explicitly without catching API resources", async () => {
    const paths: string[] = [];
    const fastify = {
      get: (path: string) => paths.push(path),
      setNotFoundHandler: () => undefined,
    };

    await staticWebRoutes(fastify);

    expect(paths).toContain("/");
    expect(paths).toContain("/404.html");
    expect(paths).toContain("/app.css");
    expect(paths).toContain("/index.html");
    expect(paths).toContain("/compare.html");
    expect(paths).toContain("/recruiting/deal-gaps.html");
    expect(paths).toContain("/design-system/components.css");
    expect(paths).not.toContain("/design-system/dom.js");
    expect(paths).not.toContain("/design-system/organisms-nav.js");
    expect(paths).not.toContain("/app-money-formatters.js");
    expect(paths).toContain(UNKNOWN_ROUTE_PATTERN);
    expect(paths).not.toContain("/Feed");
    expect(paths).not.toContain("/:asset");
  });

  it("serves static assets as string bodies for Harper Fastify replies", async () => {
    const handlers = new Map<string, RouteHandler>();
    const sent: unknown[] = [];
    const headerSets: Array<Record<string, string>> = [];
    const fastify = {
      get: (path: string, handler: RouteHandler) => handlers.set(path, handler),
      setNotFoundHandler: () => undefined,
    };
    const reply = {
      headers: (headers: Record<string, string>) => {
        headerSets.push(headers);
        return reply;
      },
      send: (body: unknown) => sent.push(body),
    };

    await staticWebRoutes(fastify);
    await handlers.get("/app.css")?.({}, reply);

    expect(headerSets[0]).toMatchObject({
      "cache-control": "public, max-age=3600",
      "content-type": "text/css; charset=utf-8",
    });
    expect(typeof sent[0]).toBe("string");
    expect(String(sent[0])).toContain(".ab-page-title");
  });

  it("serves binary static assets as buffered bodies", async () => {
    const handlers = new Map<string, RouteHandler>();
    const sent: unknown[] = [];
    const headerSets: Array<Record<string, string>> = [];
    const fastify = {
      get: (path: string, handler: RouteHandler) => handlers.set(path, handler),
      setNotFoundHandler: () => undefined,
    };
    const reply = {
      headers: (headers: Record<string, string>) => {
        headerSets.push(headers);
        return reply;
      },
      send: (body: unknown) => sent.push(body),
    };

    await staticWebRoutes(fastify);
    await handlers.get("/favicon.ico")?.({}, reply);

    expect(headerSets[0]).toMatchObject({
      "cache-control": "public, max-age=3600",
      "content-type": "image/x-icon",
    });
    expect(Buffer.isBuffer(sent[0])).toBe(true);
  });

  it("does not register resource routes as static assets", async () => {
    const paths: string[] = [];
    const fastify = {
      get: (path: string) => paths.push(path),
      setNotFoundHandler: () => undefined,
    };

    await staticWebRoutes(fastify);

    expect(paths).not.toContain("/Feed");
    expect(paths).not.toContain("/:asset");
  });

  it("serves the 404 app shell for unknown document routes only", async () => {
    const handlers = new Map<string, RouteHandler>();
    let notFoundHandler: RouteHandler | undefined;
    const sent: unknown[] = [];
    const statuses: number[] = [];
    const headerSets: Array<Record<string, string>> = [];
    const fastify = {
      get: (path: string, handler: RouteHandler) => handlers.set(path, handler),
      setNotFoundHandler: (handler: RouteHandler) => {
        notFoundHandler = handler;
      },
    };
    const reply = {
      code: (status: number) => {
        statuses.push(status);
        return reply;
      },
      headers: (headers: Record<string, string>) => {
        headerSets.push(headers);
        return reply;
      },
      send: (body: unknown) => sent.push(body),
    };

    await staticWebRoutes(fastify);
    await handlers.get(UNKNOWN_ROUTE_PATTERN)?.(
      { url: "/this-page-does-not-exist", headers: { accept: "text/html" } },
      reply
    );
    await handlers.get(UNKNOWN_ROUTE_PATTERN)?.(
      { url: "/other-missing-route", headers: { accept: "*/*" } },
      reply
    );
    await handlers.get(UNKNOWN_ROUTE_PATTERN)?.(
      { url: "/missing.js", headers: { accept: "*/*" } },
      reply
    );
    await handlers.get(UNKNOWN_ROUTE_PATTERN)?.(
      { url: "/missing.css?v=stale", headers: { accept: "text/html" } },
      reply
    );
    await notFoundHandler?.(
      { url: "/nested/missing", headers: { accept: "text/html" } },
      reply
    );

    expect(statuses).toEqual([404, 404, 404, 404, 404]);
    expect(headerSets[0]).toMatchObject({
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    expect(String(sent[0])).toContain("/not-found.js");
    expect(sent[1]).toBe("Not found");
    expect(sent[2]).toBe("Not found");
    expect(sent[3]).toBe("Not found");
    expect(String(sent[4])).toContain("/not-found.js");
  });
});
