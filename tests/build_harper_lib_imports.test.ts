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
});
