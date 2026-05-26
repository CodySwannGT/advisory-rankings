/**
 * Shared TypeScript contracts for Harper Resource subclasses in this project.
 *
 * The `harperdb` package already publishes high-fidelity types for the
 * `Resource` base class, `RequestTarget`, `Context`, and `Id`. This module:
 *
 *   1. Re-exports the subset used pervasively in `src/harper/*` so callers
 *      have a single import path.
 *   2. Adds the small project-specific shapes that ride on top of the
 *      Harper primitives — most notably the "route target" the project
 *      normalizes via `normalizeId()` in `resource-routing.ts`.
 *   3. Defines `JsonBody` for POST/PUT payloads parsed from request bodies.
 *
 * Keep this module tiny. Anything Harper itself types correctly should be
 * re-exported, not redeclared.
 */

export type { Context, Query, RequestTargetOrId, Session } from "harperdb";

import type { RequestTargetOrId } from "harperdb";

/**
 * Primary-key shape Harper accepts on `Resource` methods. Mirrors the
 * private `Id` alias in `harperdb/resources/ResourceInterface` (not
 * re-exported from the package top-level, so we redeclare it here to
 * give callers a single import path).
 */
export type Id = number | string | readonly (number | string | null)[] | null;

/**
 * The shape of the `target` argument Harper hands to overridden Resource
 * methods such as `get(target)` and `post(target, body)`.
 *
 * In practice the project sees three concrete shapes:
 *
 *   - A bare primary key (`string`/`number`), used by direct REST calls
 *     like `/AdvisorRating/<advisorId>`.
 *   - A `RequestTarget` (proxy-like object with `.get(name)`, `.id`,
 *     `.toString()`, etc.) when Harper is parsing query params.
 *   - A plain object (e.g. `{ advisorId, id, toString() }`) the tests
 *     use as a route-target stand-in.
 *
 * Code that needs a stable string id should call `normalizeId(target)`
 * from `src/harper/resource-routing.ts` instead of inspecting the union
 * directly.
 */
export type RouteTarget = RequestTargetOrId | RouteTargetObject;

/**
 * Test- and fixture-friendly route target. Harper's real `RequestTarget`
 * implements this shape and more; callers that only need the id can use
 * this narrower interface to avoid pulling in the full harperdb type.
 */
export interface RouteTargetObject {
  readonly id?: Id;
  readonly advisorId?: string;
  readonly toString?: () => string;
  readonly get?: (name: string) => unknown;
}

/**
 * Loose JSON body shape for POST/PUT payloads. Resource methods that
 * need to inspect specific fields should narrow this with a per-payload
 * interface — this type only guarantees that the value is a non-array
 * object with arbitrary string keys.
 */
export type JsonBody = Readonly<Record<string, unknown>>;
