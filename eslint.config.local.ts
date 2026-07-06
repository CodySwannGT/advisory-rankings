/**
 * ESLint 9 Flat Config - Project-Local Customizations
 *
 * Add project-specific ESLint rules here. This file is create-only,
 * meaning Lisa will create it but never overwrite your customizations.
 *
 * Example:
 * ```ts
 * export default [
 *   {
 *     files: ["src/legacy/**"],
 *     rules: {
 *       "@typescript-eslint/no-explicit-any": "off",
 *     },
 *   },
 * ];
 * ```
 *
 * @see https://eslint.org/docs/latest/use/configure/configuration-files-new
 * @module eslint.config.local
 */
export default [
  {
    ignores: [
      "wiki/lisa-wiki.config.json",
      // Lisa-owned tracker config. The build-label `done.{dev,staging,production}`
      // sub-keys are required by the Lisa schema, and for a main-only repo all
      // three intentionally collapse to the same `status:done` literal — which
      // trips sonarjs/no-duplicate-string. The structure isn't ours to refactor.
      ".lisa.config.json",
      // Generated Harper deploy artifacts: the build emits one
      // `harper-app/resource-<name>.js` per resource alongside
      // `harper-app/resources.js`. They are gitignored build output, not
      // source. Kept here (create-only) so the ignore survives Lisa updates
      // that overwrite eslint.ignore.config.json. Upstreamed to Lisa's
      // harper-fabric defaultHarperFabricIgnores.
      "harper-app/resource-*.js",
      "harper-app/resources.js",
      "harper-app/lib/**/*.js",
    ],
  },
  {
    files: ["src/**/*.ts"],
    // Platform built-ins are declared trusted-immutable leaves. `Date`/`URL`
    // and the DOM node types (`Node`, `Element`, `HTMLElement`, …) all expose
    // mutating methods, so the plugin rates them "Mutable" and — because the
    // Harper row types hold `Date` (returned in-process) and the web layer
    // holds DOM refs in its readonly option bags — caps nearly every type in
    // the codebase below `ReadonlyDeep`. That is why the rule was previously
    // disabled wholesale. We never treat these platform objects as owned data
    // (a readonly field holding one is not a mutation vector the code cares
    // about), so declaring them opaque immutable leaves lets the rule enforce
    // genuine deep-readonly on everything the app actually owns. This is the
    // standard `is-immutable-type` override pattern. (Upstreamed to Lisa's
    // harper-fabric config so every Harper project inherits it.)
    settings: {
      immutability: {
        overrides: [
          { type: "Date", to: "Immutable" },
          { type: "URL", to: "Immutable" },
          { type: "Node", to: "Immutable" },
          { type: "Element", to: "Immutable" },
          { type: "HTMLElement", to: "Immutable" },
          { type: "SVGElement", to: "Immutable" },
          { type: "Event", to: "Immutable" },
          { type: "EventTarget", to: "Immutable" },
          { type: "Blob", to: "Immutable" },
          // DOM element/event subtypes (same trusted-leaf category as
          // `HTMLElement`/`Event` above). `is-immutable-type` matches
          // overrides by exact type name, so the base-class entries do not
          // cover the concrete subtypes the web layer actually holds in its
          // readonly control bags (`HTMLInputElement`, `KeyboardEvent`, …).
          // These are platform DOM objects the app never owns as data, so
          // they are opaque immutable leaves exactly like `HTMLElement`.
          { type: "HTMLInputElement", to: "Immutable" },
          { type: "HTMLSelectElement", to: "Immutable" },
          { type: "HTMLTextAreaElement", to: "Immutable" },
          { type: "HTMLButtonElement", to: "Immutable" },
          { type: "HTMLAnchorElement", to: "Immutable" },
          { type: "HTMLFormElement", to: "Immutable" },
          { type: "HTMLImageElement", to: "Immutable" },
          { type: "HTMLDivElement", to: "Immutable" },
          { type: "HTMLSpanElement", to: "Immutable" },
          { type: "KeyboardEvent", to: "Immutable" },
          { type: "MouseEvent", to: "Immutable" },
          { type: "InputEvent", to: "Immutable" },
          { type: "SubmitEvent", to: "Immutable" },
          { type: "FocusEvent", to: "Immutable" },
          { type: "PointerEvent", to: "Immutable" },
          // Design-system DOM-content aliases. `DomChild` and its helpers are
          // the design system's names for "renderable DOM content"
          // (`Node | string | number | …` and readonly nested arrays of the
          // same) — a platform-content leaf, not app data. `is-immutable-type`
          // cannot apply the `Node` leaf override to a top-level union *alias*
          // member (only to properties), so these bottom-out unions read as
          // `Mutable` despite being fully readonly. Blessing the aliases
          // themselves is the same principled leaf move as blessing `Node`.
          { type: "DomChild", to: "Immutable" },
          { type: "DomChildLeaf", to: "Immutable" },
          { type: "DomChildArray", to: "Immutable" },
          // Molecules' sibling content-value unions, built on the same
          // `Node`/primitive leaves as `DomChild` (`LeafChild` is the atoms'
          // single-`Child` leaf; `EntityRowAvatar`/`KvListValue` are the
          // avatar/value halves of the row + key-value molecules). Same
          // platform-content-leaf rationale — the checker cannot resolve the
          // `Node` override through their top-level union alias. (`DomChild`
          // already cascades to clear `OrganismChildren` and `RecruitingCell`,
          // so those need no direct entry.)
          { type: "LeafChild", to: "Immutable" },
          { type: "EntityRowAvatar", to: "Immutable" },
          { type: "KvListValue", to: "Immutable" },
        ],
      },
    },
    rules: {
      // Enforced at `ReadonlyDeep` (every property recursively `readonly`),
      // not the plugin/Lisa default of `Immutable`. `Immutable` additionally
      // rejects function-typed properties (route targets expose `.get()`),
      // `Record`/index-signature bags, and mutable-method built-ins — none
      // of which this type graph can shed without restructuring legitimate
      // shapes. `ReadonlyDeep` is the strongest achievable bar and is the
      // real immutability guarantee. Drop this override once the Lisa floor
      // ships the matching harper-fabric default.
      "functional/type-declaration-immutability": [
        "error",
        {
          // First-match wins, so the deliberately-mutable exemptions are
          // listed before the `.+` catch-all.
          rules: [
            {
              // `ResolverStats` is a raw mutable counter map
              // (`Record<statKey, number>`) bumped in place via `stats[k]++`
              // on the brokercheck loader's hot path — deliberately mutable
              // accumulator state, permitted by `functional/immutable-data`'s
              // `ignoreClasses`. It is not app data, so it is exempt from the
              // immutability floor rather than forced into an immutable
              // rebuild.
              identifiers: ["ResolverStats"],
              immutability: "Mutable",
              comparator: "AtLeast",
            },
            {
              // Service/accumulator wrappers holding readonly references to
              // deliberately-mutable runtime state: `ResolverState` (readonly
              // fields, but its `stats`/listings are populated in place) and
              // `LoadOpts` (a DI bag of live `HarperREST`/`Resolver` handles
              // with internal counters). The top-level handles ARE readonly
              // (never reassigned) — `ReadonlyShallow` enforces exactly that
              // while allowing the live state they point to. Service handles,
              // not app data.
              identifiers: ["ResolverState", "LoadOpts"],
              immutability: "ReadonlyShallow",
              comparator: "AtLeast",
            },
            {
              identifiers: [".+"],
              immutability: "ReadonlyDeep",
              comparator: "AtLeast",
            },
          ],
        },
      ],
    },
  },
  {
    // Epic #383 Phase 0 Task #2 (issue #392): src/types/harper-schema.ts
    // mirrors every `@table` row interface from harper-app/schema.graphql
    // 1:1. With 38 tables it crosses the project-wide max-lines threshold,
    // but splitting it into multiple files defeats the "single source of
    // truth for Harper row shapes" contract that every Phase 1+ file-strip
    // task imports from. The schema GraphQL file itself is the same shape
    // on disk; this TS mirror is intentionally co-extensive. Per the
    // Epic #383 rule "relax the rule in config instead of suppressing in
    // source," override max-lines here rather than adding a per-file
    // suppression to the scaffolded file.
    files: ["src/types/harper-schema.ts"],
    rules: {
      "max-lines": "off",
    },
  },
  {
    // Test files: extend the upstream test relaxations (which already turn
    // off functional/immutable-data, functional/no-let,
    // max-lines-per-function, and no-restricted-syntax) with a few more
    // rules that produce noise without value in test code:
    //   - max-lines: fixture-heavy suites legitimately run long; splitting
    //     them by topic-per-file fragments cohesion without improving
    //     readability.
    //   - jsdoc/require-jsdoc: tests are self-documenting through their
    //     describe/it names; per-helper JSDoc is overhead.
    //   - sonarjs/assertions-in-tests: false-positives on tests that
    //     assert through Playwright `expect` helpers or capture-callback
    //     side effects.
    //   - sonarjs/publicly-writable-directories: tests legitimately use
    //     `os.tmpdir()` / `/tmp` for synthetic fixtures.
    // Per the Epic #383 rule "relax the rule in config instead of
    // suppressing in source," these belong here rather than as file-level
    // suppressions.
    files: ["tests/**/*.test.ts", "tests/**/*.ts", "**/__tests__/**/*.ts"],
    rules: {
      "max-lines": "off",
      "jsdoc/require-jsdoc": "off",
      "sonarjs/assertions-in-tests": "off",
      "sonarjs/publicly-writable-directories": "off",
    },
  },
  {
    rules: {
      // Pre-existing awaited and nested-function side effects predate Lisa
      // 2.189.18's tightened statement-order checks. Keep the published rule
      // stricter by default while this repo carries that cleanup as separate
      // follow-up work (mirrors the Lisa repo's own opt-out).
      "code-organization/enforce-statement-order": [
        "error",
        { checkAllFunctionBodies: false, checkAwaitedCalls: false },
      ],
    },
  },
];
