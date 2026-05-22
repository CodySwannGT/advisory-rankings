/**
 * Vitest Configuration - Project-Local Customizations
 *
 * Add project-specific Vitest settings here. This file is create-only,
 * meaning Lisa will create it but never overwrite your customizations.
 *
 * Example:
 * ```ts
 * import type { ViteUserConfig } from "vitest/config";
 *
 * const config: ViteUserConfig = {
 *   resolve: {
 *     alias: {
 *       "@/": new URL("./src/", import.meta.url).pathname,
 *     },
 *   },
 * };
 *
 * export default config;
 * ```
 *
 * @see https://vitest.dev/config/
 * @module vitest.config.local
 */
import type { ViteUserConfig } from "vitest/config";

const config: ViteUserConfig = {
  test: {
    coverage: {
      // CLI entrypoints depend on live services, network, or local files; keep
      // the unit coverage threshold focused on reusable app and library code.
      exclude: [
        "**/*.d.ts",
        "**/index.ts",
        "**/node_modules/**",
        "**/dist/**",
        "**/.claude/worktrees/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.mock.ts",
        "**/test/**",
        "**/tests/**",
        "**/__tests__/**",
        "**/__mocks__/**",
        "**/components/ui/**",
        "src/build/**",
        "src/scripts/**",
        "src/types/**",
        "src/web/**/*.ts",
      ],
    },
  },
};

export default config;
