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
    rules: {
      // Epic #383 (issue #391): the upstream Harper/Fabric config enforces
      // `functional/type-declaration-immutability` at the default
      // `Immutable` enforcement level. That cascades across the
      // BrokerCheck/firm-source type graph the moment any `@ts-nocheck`
      // file becomes type-checked, forcing per-file `eslint-disable`
      // comments that the @ts-nocheck strip epic is explicitly trying to
      // eliminate. Turn the rule off project-wide so that removing
      // `@ts-nocheck` in later Phase 1+ tasks does not require new
      // disables. `readonly`/`Readonly<…>` declarations remain idiomatic
      // and load-bearing in this repo; the rule was never the mechanism
      // protecting them.
      "functional/type-declaration-immutability": "off",
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
];
