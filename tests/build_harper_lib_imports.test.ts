/**
 * Regression guard for the Harper component bundle.
 *
 * Issue #721 verification surfaced a deploy-time
 * `ERR_MODULE_NOT_FOUND` because `src/harper/resource-advisor-token-query.ts`
 * imported `from "../lib/advisor-tokens.js"`, but
 * `src/build/build.ts` only mirrored `dist/harper/` into the Fabric
 * component root — `dist/lib/` was never copied. Harper Fabric refused
 * to load the component on reload, every endpoint 5xx'd, and no unit
 * test caught it because the suite mocks `tables` directly and never
 * loads the bundle through Harper's resource loader.
 *
 * The build was fixed (build.ts now copies dist/lib → harper-app/lib
 * and rewrites `../lib/` → `./lib/`), but the next time a
 * `src/harper/*.ts` adds a fresh `from "../lib/..."` import that the
 * build forgets to ship, the same class of failure can recur. This
 * test walks every compiled `dist/harper/*.js`, extracts each
 * `from "../lib/<name>.js"` specifier, and fails if the referenced
 * file is missing from `dist/lib/` — pure filesystem introspection,
 * no Harper required.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = new URL("../", import.meta.url).pathname;
const HARPER_APP = join(REPO_ROOT, "harper-app");
const HARPER_WEB = join(HARPER_APP, "web");
const CLEAN_ROUTE_SHELLS = [
  ["advisors", "advisors.html"],
  ["branches", "branches.html"],
  ["firms", "firms.html"],
  ["investor-proof", "investor-proof.html"],
  ["recruiting", "recruiting.html"],
  ["recruiting/shortlist", "recruiting-shortlist.html"],
  ["regulatory/discrepancies", "regulatory-discrepancies.html"],
  ["research/freshness", "research-freshness.html"],
  ["source-triage", "source-triage.html"],
  ["teams", "teams.html"],
  ["login", "../login/shell.html"],
] as const;

// Match any relative `from "./lib/<file>.js"` or `from "../lib/<file>.js"`
// import. We check BOTH forms because:
//   - `./lib/` is the production shape after `src/build/build.ts`
//     rewrites the tsc-emitted `../lib/` to a same-dir reference.
//   - `../lib/` should NEVER appear in `harper-app/` (Node ESM follows
//     real paths through the Fabric symlink and resolves to
//     `<repo-root>/lib/`, which is not a real directory — the exact
//     failure mode that crashed Harper Fabric on issue #721). Catching
//     it here means a future regression in the build rewrite step is
//     visible as a test failure, not a deploy-time ERR_MODULE_NOT_FOUND.
const LIB_IMPORT_RE = /from\s+["'](\.{1,2})\/lib\/([^"']+\.js)["']/g;

const harperJsFiles = (): readonly string[] => {
  if (!existsSync(HARPER_APP)) return [];
  return readdirSync(HARPER_APP)
    .filter(name => name.endsWith(".js"))
    .map(name => join(HARPER_APP, name))
    .filter(path => statSync(path).isFile());
};

const webHtmlFiles = (): readonly string[] => {
  if (!existsSync(HARPER_WEB)) return [];
  return readdirSync(HARPER_WEB)
    .filter(name => name.endsWith(".html"))
    .map(name => join(HARPER_WEB, name))
    .filter(path => statSync(path).isFile());
};

/**
 *
 */
interface LibImport {
  readonly importer: string;
  readonly prefix: string;
  readonly specifier: string;
}

const libImportsIn = (file: string): readonly LibImport[] => {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(LIB_IMPORT_RE)].map(match => ({
    importer: file.replace(REPO_ROOT, ""),
    prefix: match[1],
    specifier: match[2],
  }));
};

interface ModuleEntrypoint {
  readonly html: string;
  readonly src: string;
}

const externalModuleEntrypointsIn = (
  file: string
): readonly ModuleEntrypoint[] => {
  const source = readFileSync(file, "utf8");
  return [
    ...scriptOpenTags(source).map(tag => moduleSrc(tag)),
    ...inlineModuleImports(source),
  ]
    .filter((src): src is string => Boolean(src?.endsWith(".js")))
    .map(src => ({ html: file.replace(REPO_ROOT, ""), src }));
};

const scriptOpenTags = (source: string): readonly string[] =>
  source
    .split("<script")
    .slice(1)
    .map(chunk => chunk.slice(0, chunk.indexOf(">")))
    .filter(
      tag => tag.includes('type="module"') || tag.includes("type='module'")
    );

const moduleSrc = (tag: string): string | null => {
  const src = quotedAttributeValue(tag, "src");
  if (!src || !isLocalModuleSrc(src)) return null;
  return src.startsWith("/") ? src.slice(1) : src;
};

const inlineModuleImports = (source: string): readonly string[] =>
  inlineModuleScriptBodies(source)
    .flatMap(body => body.split(";"))
    .filter(statement => statement.includes("import"))
    .map(quotedJavaScriptModuleSpecifier)
    .filter((src): src is string => src !== null)
    .filter(isLocalModuleSrc)
    .map(src => (src.startsWith("/") ? src.slice(1) : src));

const quotedJavaScriptModuleSpecifier = (statement: string): string | null => {
  for (const quote of ['"', "'"]) {
    const parts = statement.split(quote);
    for (let index = 1; index < parts.length; index += 2) {
      const value = parts[index];
      if (value.endsWith(".js")) return value;
    }
  }
  return null;
};

const inlineModuleScriptBodies = (source: string): readonly string[] =>
  source
    .split("<script")
    .slice(1)
    .map(chunk => {
      const tagEnd = chunk.indexOf(">");
      if (tagEnd < 0) return null;
      const tag = chunk.slice(0, tagEnd);
      if (moduleSrc(tag)) return null;
      if (!tag.includes('type="module"') && !tag.includes("type='module'")) {
        return null;
      }
      const scriptEnd = chunk.indexOf("</script>", tagEnd);
      return scriptEnd < 0 ? null : chunk.slice(tagEnd + 1, scriptEnd);
    })
    .filter((body): body is string => body !== null);

const isLocalModuleSrc = (src: string): boolean =>
  !src.startsWith("//") && !/^[a-z][a-z\d+.-]*:/i.test(src);

const quotedAttributeValue = (tag: string, name: string): string | null => {
  for (const quote of ['"', "'"]) {
    const prefix = `${name}=${quote}`;
    const start = tag.indexOf(prefix);
    if (start < 0) continue;
    const valueStart = start + prefix.length;
    const valueEnd = tag.indexOf(quote, valueStart);
    return valueEnd < 0 ? null : tag.slice(valueStart, valueEnd);
  }
  return null;
};

describe("build invariant — harper-app/ lib imports must be self-contained", () => {
  it("every harper-app/*.js lib import uses ./lib/ (not ../lib/) so Fabric can resolve it", () => {
    const harperFiles = harperJsFiles();
    if (harperFiles.length === 0) {
      // harper-app/ not built (build hasn't run yet). The vitest pretest
      // builds before this point in CI; locally we skip rather than
      // false-positive.
      return;
    }

    const escapingImports = harperFiles
      .flatMap(libImportsIn)
      .filter(({ prefix }) => prefix === "..");

    expect(
      escapingImports,
      `harper-app/*.js files contain \`from "../lib/..."\` imports that escape the component root. \`src/build/build.ts\` must rewrite these to \`./lib/...\` so Node ESM resolves them inside harper-app/lib/ (Fabric follows the file's real path through the component symlink). Offenders:\n${JSON.stringify(escapingImports, null, 2)}`
    ).toEqual([]);
  });

  it('every `from "./lib/X.js"` import in harper-app/*.js has a matching harper-app/lib/X.js', () => {
    const harperFiles = harperJsFiles();
    if (harperFiles.length === 0) return;

    const missing = harperFiles
      .flatMap(libImportsIn)
      .filter(({ prefix }) => prefix === ".")
      .filter(
        ({ specifier }) => !existsSync(join(HARPER_APP, "lib", specifier))
      );

    expect(
      missing,
      `harper-app/*.js files import lib helpers that the build forgot to ship. \`src/build/build.ts\` must copy \`dist/lib/\` → \`harper-app/lib/\` so Fabric can resolve these imports. Missing targets:\n${JSON.stringify(missing, null, 2)}`
    ).toEqual([]);
  });

  it("ships every external web module referenced by generated HTML shells", () => {
    const missing = webHtmlFiles()
      .flatMap(externalModuleEntrypointsIn)
      .filter(({ src }) => !existsSync(join(HARPER_WEB, src)));

    expect(
      missing,
      `harper-app/web/*.html references module entrypoints that the build did not bundle into harper-app/web/. Missing targets:\n${JSON.stringify(missing, null, 2)}`
    ).toEqual([]);
  });

  it("generates extensionless static shells for clean public routes", () => {
    const missingOrMismatched = CLEAN_ROUTE_SHELLS.filter(
      ([routePath, sourceShell]) => {
        const cleanShell = join(HARPER_WEB, routePath, "index.html");
        const htmlShell = join(HARPER_WEB, sourceShell);
        return (
          !existsSync(cleanShell) ||
          readFileSync(cleanShell, "utf8") !== readFileSync(htmlShell, "utf8")
        );
      }
    ).map(([routePath]) => routePath);

    expect(
      missingOrMismatched,
      `src/build/build.ts must generate static directory index shells for top-level clean URLs. Missing or mismatched routes:\n${JSON.stringify(missingOrMismatched, null, 2)}`
    ).toEqual([]);
  });

  it("exports resource-backed clean profile document routes", () => {
    const routeModule = join(HARPER_APP, "resource-clean-web-routes.js");
    expect(existsSync(routeModule)).toBe(true);

    const source = readFileSync(routeModule, "utf8");
    expect(source).toContain("static directURLMapping = true");
    for (const exportName of ["advisors", "firms", "teams", "articles"]) {
      expect(source).toContain(` as ${exportName}`);
    }
  });
});
