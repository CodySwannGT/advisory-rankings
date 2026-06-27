import { readFile } from "node:fs/promises";

import type { ContentResponse } from "./detail-shell-negotiation.js";
import { normalizeId } from "./resource-routing.js";
import type { RouteTarget } from "../types/harper-resource.js";

const HTML_CONTENT_TYPE = "text/html; charset=utf-8";

/**
 * Reads a generated web shell from the deployed component root.
 * @param shellFile - Shell file under `harper-app/web/`.
 * @returns Shell HTML body.
 */
function readShellHtml(shellFile: string): Promise<string> {
  return readFile(new URL(`./web/${shellFile}`, import.meta.url), "utf8").catch(
    error => {
      if (!isNotFound(error)) throw error;
      return readFile(
        new URL(`../../harper-app/web/${shellFile}`, import.meta.url),
        "utf8"
      );
    }
  );
}

/**
 * Narrows file read failures to missing-file cases.
 * @param error - Unknown read failure.
 * @returns Whether the error is a missing file.
 */
function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/**
 * Builds a Harper raw-content response for an HTML app shell.
 * @param shellFile - Shell file under `harper-app/web/`.
 * @returns Harper content response.
 */
async function shellResponse(shellFile: string): Promise<ContentResponse> {
  return {
    contentType: HTML_CONTENT_TYPE,
    data: await readShellHtml(shellFile),
  };
}

/**
 * Base class for clean public web routes backed by Harper's supported
 * jsResource loader. Deployed Fabric is not consistently mounting
 * `fastifyRoutes`, so these resources own the dynamic profile URL surface.
 */
abstract class CleanWebRoute extends Resource {
  static readonly directURLMapping = true;

  /**
   * Allows anonymous document navigations.
   * @returns True because public web shells are unauthenticated.
   */
  allowRead(): boolean {
    return true;
  }
}

/** Clean advisor directory/profile route: `/advisors[/<slug>]`. */
class AdvisorsRoute extends CleanWebRoute {
  /**
   * Serves the advisor directory or profile shell.
   * @param target - Harper route target containing the optional profile slug.
   * @returns HTML shell response.
   */
  async get(target?: RouteTarget): Promise<ContentResponse> {
    return shellResponse(
      normalizeId(target) ? "advisor.html" : "advisors.html"
    );
  }
}

/** Clean firm directory/profile route: `/firms[/<slug>]`. */
class FirmsRoute extends CleanWebRoute {
  /**
   * Serves the firm directory or profile shell.
   * @param target - Harper route target containing the optional profile slug.
   * @returns HTML shell response.
   */
  async get(target?: RouteTarget): Promise<ContentResponse> {
    return shellResponse(normalizeId(target) ? "firm.html" : "firms.html");
  }
}

/** Clean team directory/profile route: `/teams[/<slug>]`. */
class TeamsRoute extends CleanWebRoute {
  /**
   * Serves the team directory or profile shell.
   * @param target - Harper route target containing the optional profile slug.
   * @returns HTML shell response.
   */
  async get(target?: RouteTarget): Promise<ContentResponse> {
    return shellResponse(normalizeId(target) ? "team.html" : "teams.html");
  }
}

/** Clean article detail route: `/articles/<slug>`. */
class ArticlesRoute extends CleanWebRoute {
  /**
   * Serves the article detail shell.
   * @returns HTML shell response.
   */
  async get(): Promise<ContentResponse> {
    return shellResponse("article.html");
  }
}

export {
  AdvisorsRoute as advisors,
  ArticlesRoute as articles,
  FirmsRoute as firms,
  TeamsRoute as teams,
};
