import type { AdvisorCorrectionRequestRow } from "../types/harper-schema.js";
import type { JsonBody, RouteTarget } from "../types/harper-resource.js";

import {
  correctionRequestQueue,
  emptyCorrectionRequestQueue,
  type AdvisorCorrectionRequestQueueResponse,
} from "./resource-advisor-correction-queue.js";
import { normalizeId } from "./resource-routing.js";
import {
  currentUser,
  currentUserId,
  hasAnalystRole,
  rowsFor,
  tableByName,
  textValue,
  throwStatus,
  writeRow,
  type CurrentUserResource,
  type SearchableTable,
} from "./resource-user-watchlists-store.js";

const REQUEST_STATUSES = ["pending", "accepted", "rejected"] as const;
const MAX_FIELD_LENGTH = 120;
const MAX_VALUE_LENGTH = 2_000;
const MAX_NOTE_LENGTH = 2_000;
const MAX_SOURCE_LENGTH = 500;
const MAX_CONTEXT_LENGTH = 4_000;

/**
 *
 */
type CorrectionStatus = (typeof REQUEST_STATUSES)[number];

/**
 *
 */
interface CorrectionRequestBody extends JsonBody {
  readonly id?: unknown;
  readonly advisorId?: unknown;
  readonly fieldName?: unknown;
  readonly displayedValue?: unknown;
  readonly proposedValue?: unknown;
  readonly submitterNote?: unknown;
  readonly note?: unknown;
  readonly sourceType?: unknown;
  readonly sourceRef?: unknown;
  readonly sourceContext?: unknown;
  readonly status?: unknown;
  readonly reviewerNote?: unknown;
}

/**
 *
 */
interface CorrectionRequestResponse {
  readonly authenticated: true;
  readonly request: AdvisorCorrectionRequestRow;
}

/**
 *
 */
type CorrectionRequestGetResponse =
  | CorrectionRequestResponse
  | AdvisorCorrectionRequestQueueResponse;

/** Authenticated submission and analyst review surface for advisor corrections. */
export class AdvisorCorrectionRequest extends Resource {
  /**
   * Lets signed-in reviewers read one correction request without exposing raw table routes.
   * @returns Always true; authorization is enforced inside the handler.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Allows signed-in clients to submit and review correction requests.
   * @returns Always true; authorization is enforced inside the handler.
   */
  allowCreate(): boolean {
    return true;
  }

  /**
   * Returns one persisted correction request by id, or the analyst pending inbox.
   * @param target Route target containing the correction request id.
   * @returns Stored correction request row or pending queue payload.
   */
  async get(target?: RouteTarget): Promise<CorrectionRequestGetResponse> {
    const resource = this as CurrentUserResource;
    const userId = currentUserId(resource);
    const requestId = normalizeId(target);
    if (!userId) return unauthenticatedCorrectionRead(requestId);
    if (!requestId) return correctionQueueForUser(resource);
    return correctionRequestForUser(requestId, userId, resource);
  }

  /**
   * Creates a pending request or persists an analyst disposition.
   * @param args Harper route target and JSON body arguments.
   * @returns The created or updated correction request row.
   */
  async post(...args: readonly unknown[]): Promise<CorrectionRequestResponse> {
    const resource = this as CurrentUserResource;
    const userId = currentUserId(resource);
    if (!userId) throwStatus("Sign in required", 401);

    const body = findBody(args);
    const id = normalizeId(args.find(isRouteTarget)) || stringValue(body.id);
    const status = correctionStatus(body.status);
    if (id || status !== "pending") {
      return {
        authenticated: true,
        request: await reviewRequest(
          id,
          body,
          userId,
          hasAnalystRole(currentUser(resource))
        ),
      };
    }
    return { authenticated: true, request: await createRequest(body, userId) };
  }
}

/**
 * Handles anonymous correction reads without leaking item existence.
 * @param requestId Optional route id.
 * @returns Empty public queue envelope for list reads.
 */
function unauthenticatedCorrectionRead(
  requestId: string
): AdvisorCorrectionRequestQueueResponse {
  if (requestId) throwStatus("Sign in required", 401);
  return emptyCorrectionRequestQueue(false, false);
}

/**
 * Returns the pending analyst queue or an authorized empty envelope.
 * @param resource Current Harper resource instance.
 * @returns Pending queue payload for analysts, empty payload otherwise.
 */
async function correctionQueueForUser(
  resource: CurrentUserResource
): Promise<AdvisorCorrectionRequestQueueResponse> {
  return hasAnalystRole(currentUser(resource))
    ? correctionRequestQueue(correctionRequestTable())
    : emptyCorrectionRequestQueue(true, false);
}

/**
 * Returns one correction request when the caller may read it.
 * @param requestId Persisted correction request id.
 * @param userId Current session user id.
 * @param resource Current Harper resource instance.
 * @returns Stored correction request row.
 */
async function correctionRequestForUser(
  requestId: string,
  userId: string,
  resource: CurrentUserResource
): Promise<CorrectionRequestResponse> {
  const request = await requireCorrectionRequest(requestId);
  if (
    request.submitterId !== userId &&
    !hasAnalystRole(currentUser(resource))
  ) {
    throwStatus("Correction request access denied", 403);
  }
  return {
    authenticated: true,
    request,
  };
}

/**
 * Persists a new pending advisor correction request without mutating source facts.
 * @param body Request body from the signed-in submitter.
 * @param userId Stable submitter identifier from the session.
 * @returns Newly stored correction request row.
 */
async function createRequest(
  body: CorrectionRequestBody,
  userId: string
): Promise<AdvisorCorrectionRequestRow> {
  const advisorId = requiredText(body.advisorId, "advisor id required", 200);
  const fieldName = requiredText(
    body.fieldName,
    "field name required",
    MAX_FIELD_LENGTH
  );
  const proposedValue = requiredText(
    body.proposedValue,
    "proposed value required",
    MAX_VALUE_LENGTH
  );
  const row: AdvisorCorrectionRequestRow = {
    id: newId(userId),
    advisorId,
    fieldName,
    displayedValue: textValue(body.displayedValue, MAX_VALUE_LENGTH),
    proposedValue,
    submitterId: userId,
    submitterNote: textValue(body.submitterNote ?? body.note, MAX_NOTE_LENGTH),
    sourceType: textValue(body.sourceType, MAX_SOURCE_LENGTH),
    sourceRef: textValue(body.sourceRef, MAX_SOURCE_LENGTH),
    sourceContext: textValue(body.sourceContext, MAX_CONTEXT_LENGTH),
    status: "pending",
  };
  await writeRow(correctionRequestTable(), row);
  return row;
}

/**
 * Applies an analyst disposition to an existing correction request.
 * @param id Correction request id.
 * @param body Review body containing status and optional reviewer note.
 * @param userId Stable reviewer identifier from the session.
 * @param canReview Whether the current user has analyst review permissions.
 * @returns Updated correction request row.
 */
async function reviewRequest(
  id: string,
  body: CorrectionRequestBody,
  userId: string,
  canReview: boolean
): Promise<AdvisorCorrectionRequestRow> {
  if (!canReview) throwStatus("Analyst role required", 403);
  const existing = await requireCorrectionRequest(id);
  if (existing.status !== "pending") {
    throwStatus("correction request is already reviewed", 409);
  }
  const status = correctionStatus(body.status);
  if (status === "pending") throwStatus("review status required", 400);
  const updated: AdvisorCorrectionRequestRow = {
    ...existing,
    status,
    reviewerId: userId,
    reviewerNote: textValue(body.reviewerNote ?? body.note, MAX_NOTE_LENGTH),
    reviewedAt: new Date().toISOString(),
  };
  await writeRow(correctionRequestTable(), updated);
  return updated;
}

/**
 * Loads one correction request by primary id.
 * @param id Correction request id.
 * @returns Matching correction request row.
 */
async function requireCorrectionRequest(
  id: string
): Promise<AdvisorCorrectionRequestRow> {
  if (!id) throwStatus("correction request id required", 400);
  const table = correctionRequestTable();
  const row =
    typeof table.get === "function"
      ? await table.get(id)
      : (await rowsFor(table, "id", id))[0];
  if (!row) throwStatus("correction request not found", 404);
  return row;
}

/**
 * Resolves the backing AdvisorCorrectionRequest table.
 * @returns Searchable and writable Harper table facade.
 */
function correctionRequestTable(): SearchableTable<AdvisorCorrectionRequestRow> {
  return tableByName<AdvisorCorrectionRequestRow>(
    "AdvisorCorrectionRequest",
    (tables as Readonly<Record<string, unknown>>).AdvisorCorrectionRequest
  );
}

/**
 * Parses a request status, defaulting omitted values to pending submission.
 * @param value Candidate status from request JSON.
 * @returns Supported correction request status.
 */
function correctionStatus(value: unknown): CorrectionStatus {
  if (value == null || value === "") return "pending";
  if (REQUEST_STATUSES.includes(value as CorrectionStatus)) {
    return value as CorrectionStatus;
  }
  throwStatus("unsupported correction request status", 400);
}

/**
 * Locates the JSON body argument from Harper's variadic resource invocation.
 * @param args Resource method arguments.
 * @returns Parsed body or an empty object.
 */
function findBody(args: readonly unknown[]): CorrectionRequestBody {
  return (args.find(isBody) ?? {}) as CorrectionRequestBody;
}

/**
 * Checks whether a value looks like a correction request body.
 * @param value Candidate method argument.
 * @returns True for JSON bodies accepted by this resource.
 */
function isBody(value: unknown): value is CorrectionRequestBody {
  return (
    value != null &&
    typeof value === "object" &&
    ("advisorId" in value ||
      "fieldName" in value ||
      "proposedValue" in value ||
      "status" in value ||
      "reviewerNote" in value)
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
 * Reads a required bounded text field from untrusted input.
 * @param value Candidate value.
 * @param message Error message when the value is blank.
 * @param max Maximum retained length.
 * @returns Trimmed, bounded text.
 */
function requiredText(value: unknown, message: string, max: number): string {
  const text = textValue(value, max);
  if (!text) throwStatus(message, 400);
  return text;
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
 * Builds a unique correction request id scoped to the submitter.
 * @param userId Stable submitter identifier.
 * @returns Namespaced correction request id.
 */
function newId(userId: string): string {
  return `correction:${encodeURIComponent(userId)}:${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
}
