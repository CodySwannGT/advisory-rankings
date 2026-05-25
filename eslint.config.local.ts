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
      // Generated Harper deploy artifacts: the build emits one
      // `harper-app/resource-<name>.js` per resource alongside
      // `harper-app/resources.js`. They are gitignored build output, not
      // source. Kept here (create-only) so the ignore survives Lisa updates
      // that overwrite eslint.ignore.config.json. Upstreamed to Lisa's
      // harper-fabric defaultHarperFabricIgnores.
      "harper-app/resource-*.js",
      "harper-app/resources.js",
    ],
  },
];
