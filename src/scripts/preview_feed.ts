#!/usr/bin/env node
/**
 * Offline smoke test for harper-app/resources.js.
 *
 * Why this exists: this sandbox kernel can't bind Harper's REST TCP
 * port (the same SO_REUSEPORT issue documented in
 * docs/fabric-runbook.md §5), so curl http://127.0.0.1:9926/Feed
 * doesn't work locally. Once deployed to Fabric, port 443 fronts the
 * REST endpoints just fine; locally we still want to verify that the
 * Feed/profile resources produce sane output.
 *
 * What it does: delegates to {@link loadResources} (which pulls every
 * `@export` table out of Harper via the operations-API SQL endpoint and
 * installs the `globalThis.tables` / `globalThis.Resource` shims the
 * generated module expects), then invokes the requested generated
 * resource and prints its JSON response.
 *
 * Run:
 *   bun run preview                         # /Feed
 *   bun run preview -- firm <id>
 *   bun run preview -- advisor <id>
 *   bun run preview -- team <id>
 *   bun run preview -- article <id>
 *
 * Reads HDB_ADMIN_USERNAME / HDB_ADMIN_PASSWORD from the env, falling
 * back to admin/admin-local (the bootstrap.sh defaults).
 */

import { loadResources } from "./dev_server_resources.js";

/**
 * The subset of resource commands `preview_feed` knows how to invoke.
 * Anything outside this set surfaces a usage error.
 */
const PREVIEW_COMMANDS = [
  "feed",
  "firm",
  "advisor",
  "team",
  "article",
] as const;

/** Recognized `bun run preview` subcommand. */
type PreviewCommand = (typeof PREVIEW_COMMANDS)[number];

/**
 * Narrowing predicate: tells the type system whether a raw argv string
 * is a valid {@link PreviewCommand}.
 *
 * @param value - First positional argument from `process.argv`.
 * @returns True when `value` is one of {@link PREVIEW_COMMANDS}.
 */
function isPreviewCommand(value: string): value is PreviewCommand {
  return (PREVIEW_COMMANDS as readonly string[]).includes(value);
}

/**
 * The single class-export contract `preview_feed` exercises on the
 * generated resources module. Each named export is a no-arg-constructible
 * class whose instance exposes `.get(id?)`. The wider Harper `Resource`
 * surface is intentionally not modelled here — this preview script only
 * calls `new C().get(...)`.
 */
interface PreviewableResource {
  readonly get: (id?: string) => Promise<unknown>;
}

/**
 * Constructor shape for the generated resource classes. The compiled
 * `harper-app/resources.js` exposes each `@export` class under its
 * declared name; entries on the imported module are typed as `unknown`
 * and narrowed at the call site by {@link isPreviewableConstructor}.
 */
type PreviewableConstructor = new () => PreviewableResource;

/**
 * Map of preview-command → exported class name in `harper-app/resources.js`.
 * Centralizing this avoids a per-command switch and keeps the typed
 * narrowing path identical for every command.
 */
const COMMAND_TO_EXPORT: Readonly<Record<PreviewCommand, string>> = {
  feed: "Feed",
  firm: "FirmProfile",
  advisor: "AdvisorProfile",
  team: "TeamProfile",
  article: "ArticleView",
};

/**
 * Reflective view of a constructor's prototype slot — used by
 * {@link isPreviewableConstructor} for runtime narrowing of generated
 * resource module exports.
 */
interface ConstructorWithPrototype {
  readonly prototype?: unknown;
}

/**
 * Reflective view of a generated-resource prototype that exposes a
 * `get` method — used by {@link isPreviewableConstructor}.
 */
interface PrototypeWithGet {
  readonly get?: unknown;
}

/**
 * Narrowing predicate for a generated resource export.
 *
 * The resources module is typed as `Readonly<Record<string, unknown>>`
 * because `harper-app/resources.js` is generated JavaScript with no
 * published `.d.ts`. We assert just enough — constructible with no
 * arguments and exposing a `get` function — to invoke it safely.
 *
 * @param value - Candidate module export.
 * @returns True when `value` matches {@link PreviewableConstructor}.
 */
function isPreviewableConstructor(
  value: unknown
): value is PreviewableConstructor {
  if (typeof value !== "function") return false;
  const proto: unknown = (value as ConstructorWithPrototype).prototype;
  if (typeof proto !== "object" || proto === null) return false;
  return typeof (proto as PrototypeWithGet).get === "function";
}

/**
 * Executes the requested generated resource and returns its JSON-ready
 * payload, or `null` (with `process.exitCode = 2`) when the requested
 * resource is missing/mistyped on the module.
 *
 * @param mod - Imported `harper-app/resources.js` module.
 * @param cmd - Preview command name.
 * @param id - Optional resource ID forwarded to `.get()`.
 * @returns Resource response payload, or `null` on lookup failure.
 */
async function previewResult(
  mod: Readonly<Record<string, unknown>>,
  cmd: PreviewCommand,
  id: string | undefined
): Promise<unknown> {
  const exportName = COMMAND_TO_EXPORT[cmd];
  const exported = mod[exportName];
  if (!isPreviewableConstructor(exported)) {
    console.error(
      `resource export "${exportName}" is missing or not a no-arg class`
    );
    process.exitCode = 2;
    return null;
  }
  return new exported().get(id);
}

/**
 * Entry point: parses argv, loads the generated resources module behind
 * the Harper shim, runs the requested resource, and prints the JSON.
 */
async function main(): Promise<void> {
  const rawCmd = process.argv[2] ?? "feed";
  const id = process.argv[3];

  if (!isPreviewCommand(rawCmd)) {
    console.error(`unknown command: ${rawCmd}`);
    process.exitCode = 2;
    return;
  }

  const mod = await loadResources();
  const result = await previewResult(mod, rawCmd, id);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(err.stack ?? err.message);
  } else {
    console.error(String(err));
  }
  process.exit(1);
});
