import type { RegulatoryDiscrepancyRow } from "../types/harper-schema.js";
import type { JsonBody, RouteTarget } from "../types/harper-resource.js";

import {
  currentUserId,
  rowsFor,
  textValue,
  throwStatus,
  type CurrentUserResource,
  type SearchableTable,
} from "./resource-user-watchlists-store.js";
import { normalizeId } from "./resource-routing.js";

const REVIEW_STATUSES = [
  "accepted_brokercheck",
  "accepted_advisorhub",
  "needs_followup",
  "not_a_conflict",
] as const;
const MAX_REVIEWER_NOTE_LENGTH = 2_000;

/** Persisted terminal statuses accepted by the review mutation. */
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** JSON body accepted by the regulatory discrepancy review endpoint. */
interface DiscrepancyReviewBody extends JsonBody {
  readonly id?: unknown;
  readonly status?: unknown;
  readonly reviewerNote?: unknown;
  readonly note?: unknown;
}

/** Authenticated response returned after reading or saving a review decision. */
interface DiscrepancyReviewResponse {
  readonly authenticated: true;
  readonly discrepancy: RegulatoryDiscrepancyRow;
}

/**
 * Authenticated mutation surface for recording analyst decisions on regulatory discrepancies.
 */
export class RegulatoryDiscrepancyReview extends Resource {
  /**
   * Lets authenticated clients read back one review row without exposing writes as table internals.
   * @returns Always true; auth is enforced per request.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Allows POST requests through so the handler can perform auth and validation.
   * @returns Always true.
   */
  allowCreate(): boolean {
    return true;
  }

  /**
   * Returns one persisted discrepancy review row by id.
   * @param target Route target containing the discrepancy id.
   * @returns The stored discrepancy row.
   */
  async get(target?: RouteTarget): Promise<DiscrepancyReviewResponse> {
    const userId = currentUserId(this as CurrentUserResource);
    if (!userId) throwStatus("Sign in required", 401);
    return {
      authenticated: true,
      discrepancy: await requireDiscrepancy(normalizeId(target)),
    };
  }

  /**
   * Persists a bounded analyst review decision beside immutable source facts.
   * @param args Harper route target and JSON body arguments.
   * @returns The updated discrepancy row.
   */
  async post(...args: readonly unknown[]): Promise<DiscrepancyReviewResponse> {
    const userId = currentUserId(this as CurrentUserResource);
    if (!userId) throwStatus("Sign in required", 401);

    const body = findBody(args);
    const id = normalizeId(args.find(isRouteTarget)) || stringValue(body.id);
    const existing = await requireDiscrepancy(id);
    const status = reviewStatus(body.status);
    const updated: RegulatoryDiscrepancyRow = {
      ...existing,
      status,
      reviewerId: userId,
      reviewerNote: textValue(
        body.reviewerNote ?? body.note,
        MAX_REVIEWER_NOTE_LENGTH
      ),
      reviewedAt: new Date().toISOString(),
    };

    await writeDiscrepancy(updated);
    return { authenticated: true, discrepancy: updated };
  }
}

/**
 * Loads a discrepancy by primary id, falling back to an indexed search for test shims.
 * @param id RegulatoryDiscrepancy id.
 * @returns The matching row.
 */
async function requireDiscrepancy(
  id: string
): Promise<RegulatoryDiscrepancyRow> {
  if (!id) throwStatus("discrepancy id required", 400);
  const table = regulatoryDiscrepancyTable();
  const row =
    typeof table.get === "function"
      ? await table.get(id)
      : (await rowsFor(table, "id", id))[0];
  if (!row) throwStatus("discrepancy not found", 404);
  return row;
}

/**
 * Writes the updated discrepancy through Harper's preferred upsert method.
 * @param row Updated discrepancy row.
 */
async function writeDiscrepancy(row: RegulatoryDiscrepancyRow): Promise<void> {
  const table = regulatoryDiscrepancyTable();
  if (typeof table.put === "function") {
    await table.put(row);
    return;
  }
  if (typeof table.insert === "function") {
    await table.insert(row);
    return;
  }
  if (typeof table.create === "function") {
    await table.create(row);
    return;
  }
  throwStatus("RegulatoryDiscrepancy writes are unavailable", 503);
}

/**
 * Resolves the backing RegulatoryDiscrepancy table.
 * @returns Searchable and writable Harper table facade.
 */
function regulatoryDiscrepancyTable(): SearchableTable<RegulatoryDiscrepancyRow> {
  const candidate =
    (tables as Readonly<Record<string, unknown>>).RegulatoryDiscrepancy ??
    databaseTable("RegulatoryDiscrepancy");
  if (isSearchableTable<RegulatoryDiscrepancyRow>(candidate)) {
    return candidate;
  }
  throwStatus("RegulatoryDiscrepancy table is unavailable", 503);
}

/**
 * Finds a table by name from registered Harper databases when the table registry is absent.
 * @param name Table name.
 * @returns Matching database table candidate.
 */
function databaseTable(name: string): unknown {
  for (const database of Object.values(databases)) {
    const candidate = Reflect.get(database, name);
    if (candidate) return candidate;
  }
  return undefined;
}

/**
 * Parses and validates a review status from untrusted request JSON.
 * @param value Candidate status.
 * @returns Accepted persisted review status.
 */
function reviewStatus(value: unknown): ReviewStatus {
  if (REVIEW_STATUSES.includes(value as ReviewStatus)) {
    return value as ReviewStatus;
  }
  throwStatus("unsupported review status", 400);
}

/**
 * Locates the JSON body argument from Harper's variadic resource invocation.
 * @param args Resource method arguments.
 * @returns Parsed body or an empty object.
 */
function findBody(args: readonly unknown[]): DiscrepancyReviewBody {
  return (args.find(isBody) ?? {}) as DiscrepancyReviewBody;
}

/**
 * Checks whether a value looks like a request body instead of a route target.
 * @param value Candidate method argument.
 * @returns True for JSON bodies accepted by this resource.
 */
function isBody(value: unknown): value is DiscrepancyReviewBody {
  return (
    value != null &&
    typeof value === "object" &&
    ("status" in value || "reviewerNote" in value || "note" in value)
  );
}

/**
 * Checks whether a value looks like a Harper route target.
 * @param value Candidate method argument.
 * @returns True for route targets.
 */
function isRouteTarget(value: unknown): value is RouteTarget {
  return (
    value != null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "get") === "function"
  );
}

/**
 * Reads a string from untrusted input.
 * @param value Candidate value.
 * @returns String value or empty string.
 */
function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Verifies the minimum table surface needed by the review resource.
 * @param value Candidate table.
 * @returns True when the candidate can be searched.
 */
function isSearchableTable<Row>(value: unknown): value is SearchableTable<Row> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "search") === "function"
  );
}
