import { readFile } from "node:fs/promises";

import type { ContentResponse } from "./detail-shell-negotiation.js";
import { normalizeId } from "./resource-routing.js";
import type { RouteTarget } from "../types/harper-resource.js";

const HTML_CONTENT_TYPE = "text/html; charset=utf-8";

/**
 * Reads a generated shell from the deployed component root.
 * @param shellFile - Shell file under `harper-app/`.
 * @returns Shell HTML body.
 */
function readShellHtml(shellFile: string): Promise<string> {
  return readFile(new URL(`./${shellFile}`, import.meta.url), "utf8").catch(
    error => {
      if (!isNotFound(error)) throw error;
      return readFile(
        new URL(`../../harper-app/${shellFile}`, import.meta.url),
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
 * @param shellFile - Shell file under `harper-app/`.
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
      normalizeId(target) ? "web/advisor.html" : "web/advisors.html"
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
    return shellResponse(
      normalizeId(target) ? "web/firm.html" : "web/firms.html"
    );
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
    return shellResponse(
      normalizeId(target) ? "web/team.html" : "web/teams.html"
    );
  }
}

/** Clean article detail route: `/articles/<slug>`. */
class ArticlesRoute extends CleanWebRoute {
  /**
   * Serves the article detail shell.
   * @returns HTML shell response.
   */
  async get(): Promise<ContentResponse> {
    return shellResponse("web/article.html");
  }
}

/** Clean correction inbox route: `/corrections`. */
class CorrectionsRoute extends CleanWebRoute {
  /**
   * Serves the analyst correction inbox shell.
   * @returns HTML shell response.
   */
  async get(): Promise<ContentResponse> {
    return shellResponse("web/correction-inbox.html");
  }
}

/** Clean login route: `/login`. */
class LoginRoute extends CleanWebRoute {
  /**
   * Serves the public login shell.
   * @returns HTML shell response.
   */
  async get(): Promise<ContentResponse> {
    return shellResponse("login/shell.html");
  }
}

export {
  AdvisorsRoute as advisors,
  ArticlesRoute as articles,
  CorrectionsRoute as corrections,
  FirmsRoute as firms,
  LoginRoute as login,
  TeamsRoute as teams,
};
