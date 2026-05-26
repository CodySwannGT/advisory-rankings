/**
 * Surface Harper/Fabric ambient globals (Resource, tables, databases, server,
 * logger, createBlob) declared by the `harperdb` package into the project's
 * type graph. The harperdb package's `index.d.ts` already contains the
 * `declare global { ... }` block; this triple-slash directive is what pulls
 * those declarations into TS without forcing every source file to import.
 */
/// <reference types="harperdb" />
export {};
