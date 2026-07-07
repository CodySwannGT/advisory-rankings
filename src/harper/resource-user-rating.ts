import type { Resource as HarperResource } from "harperdb";
import type { UserRatingRow } from "../types/harper-schema.js";
import type { JsonBody, RouteTarget } from "../types/harper-resource.js";
import { normalizeId } from "./resource-routing.js";
import { requireSameOrigin } from "./resource-request-origin.js";

const RATING_FIELDS = [
  "ratingInt",
  "responsiveness",
  "transparency",
  "performance",
  "planningDepth",
] as const;

/**
 * Persisted numeric rating field names.
 */
type RatingField = (typeof RATING_FIELDS)[number];

/**
 * Sanitized payload stored for one user/advisor pair.
 */
type RatingPayload = Readonly<
  Partial<Record<RatingField, number | null>> &
    Record<"reviewText", string | null>
>;

/**
 * Rating shape returned to callers.
 */
type RatingResponseRow = Readonly<
  Pick<
    UserRatingRow,
    | "advisorId"
    | "ratingInt"
    | "responsiveness"
    | "transparency"
    | "performance"
    | "planningDepth"
  >
> &
  Readonly<Record<"reviewText", string>>;

/**
 * Auth-aware private rating response.
 */
type RatingState = Readonly<
  Record<"authenticated", boolean> & Record<"rating", RatingResponseRow | null>
>;

/**
 * Rating POST body accepted by this resource.
 */
type RatingBody = JsonBody &
  Readonly<Partial<Record<"advisorId" | "id" | "reviewText", unknown>>> &
  Readonly<Partial<Record<RatingField, unknown>>>;

/**
 * Route target or body value that can carry an advisor id.
 */
type RatingTarget = RouteTarget | RatingBody | null | undefined;

/**
 * Complete writable user rating row.
 */
type UserRatingWritableRow = UserRatingRow & RatingPayload;

/**
 * Return type from Harper table write methods.
 */
type UserRatingWriteResult =
  | Promise<UserRatingWritableRow | void>
  | UserRatingWritableRow
  | void;

/**
 * UserRating table search target used by the fallback lookup.
 */
type UserRatingSearchCondition = Readonly<
  Record<"attribute", "userId"> & Record<"value", string>
>;

/**
 * UserRating search parameters used by the fallback lookup.
 */
interface UserRatingSearchTarget {
  readonly conditions: readonly [UserRatingSearchCondition];
}

/**
 * Minimal UserRating table facade used by this resource.
 */
interface UserRatingTable {
  readonly get?: (
    id: string
  ) => Promise<UserRatingRow | null> | UserRatingRow | null;
  readonly search: (
    target: UserRatingSearchTarget
  ) => AsyncIterable<UserRatingRow>;
  readonly put?: (row: UserRatingWritableRow) => UserRatingWriteResult;
  readonly insert?: (row: UserRatingWritableRow) => UserRatingWriteResult;
  readonly create?: (row: UserRatingWritableRow) => UserRatingWriteResult;
}

/** User-scoped private rating for one advisor. */
export class AdvisorRating extends Resource {
  /**
   * Lets the page learn whether the current visitor has a private rating.
   * @returns True because signed-out reads return an empty private state.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Allows signed-in users to save their own private rating.
   * @returns True because authorization is enforced per request.
   */
  allowCreate(): boolean {
    return true;
  }

  /**
   * Loads only the current user's private rating for one advisor.
   * @param target - Route target containing advisor id.
   * @returns User-scoped rating state.
   */
  async get(target?: RouteTarget): Promise<RatingState> {
    const advisorId = normalizeAdvisorId(target);
    if (!advisorId) throwStatus("advisor id required", 400);
    const userId = currentUserId(this);
    if (!userId) return { authenticated: false, rating: null };
    return {
      authenticated: true,
      rating: sanitizeRating(await findRating(userId, advisorId)),
    };
  }

  /**
   * Creates or replaces the current user's private rating for one advisor.
   * @param {...any} args - Harper route and JSON body arguments.
   * @returns Saved rating state.
   */
  async post(...args: readonly unknown[]): Promise<RatingState> {
    const body = args.find(isBody) || {};
    const advisorId = normalizeAdvisorId(args.find(isTarget) || body);
    const userId = currentUserId(this);
    requireSameOrigin(this.getContext?.());
    if (!advisorId) throwStatus("advisor id required", 400);
    if (!userId) throwStatus("Sign in required", 401);
    return saveRating(userId, advisorId, body);
  }
}

/**
 * Merges the request payload over any existing rating and persists it.
 * Split out of {@link UserRating.post} so the pure argument parsing precedes
 * the origin/validation guards while the awaited read-modify-write stays
 * after them — preserving the 403 → 400 → 401 error ordering.
 * @param userId Authenticated rater id.
 * @param advisorId Advisor being rated.
 * @param body Parsed rating payload from the request.
 * @returns Saved rating state.
 */
async function saveRating(
  userId: string,
  advisorId: string,
  body: RatingBody
): Promise<RatingState> {
  const row: UserRatingWritableRow = {
    ...(await findRating(userId, advisorId)),
    ...ratingPayload(body),
    id: ratingId(userId, advisorId),
    advisorId,
    userId,
  };
  await writeRow(row);
  return { authenticated: true, rating: sanitizeRating(row) };
}

/**
 * Resolves the advisor id from Harper targets or JSON payload fallbacks.
 * @param value - Candidate route target or request body.
 * @returns Advisor id or an empty string when absent.
 */
function normalizeAdvisorId(value: RatingTarget): string {
  const normalized = isBody(value) ? "" : normalizeId(value);
  if (normalized) return normalized;
  if (!isRecord(value)) return "";
  return stringValue(value.advisorId) || stringValue(value.id) || "";
}

/**
 * Resolves the stable current-user key used to scope private ratings.
 * @param resource - Resource instance handling the request.
 * @returns Current user id, email, username, or null when signed out.
 */
function currentUserId(resource: HarperResource): string | null {
  const user = resource.getCurrentUser?.();
  return (
    stringValue(user?.id) ||
    stringValue(user?.email) ||
    stringValue(user?.username) ||
    null
  );
}

/**
 * Loads the current user's rating for one advisor.
 * @param userId - Current user identifier.
 * @param advisorId - Advisor identifier.
 * @returns Matching rating row or null.
 */
async function findRating(
  userId: string,
  advisorId: string
): Promise<UserRatingRow | null> {
  const id = ratingId(userId, advisorId);
  const userRatings = userRatingTable();
  try {
    if (typeof userRatings.get === "function") {
      const row = await userRatings.get(id);
      if (!row) return null;
      // Defense-in-depth: ignore a row whose owner/advisor doesn't match
      // the requested pair (should be impossible with our derived id, but
      // protects against legacy rows or hash-collision-resistant changes).
      if (row.userId !== userId || row.advisorId !== advisorId) return null;
      return row;
    }
    // Fallback for environments without primary-key get (kept for the in-process
    // test fixture). Filter by indexed userId rather than scanning every row.
    const iter = userRatings.search({
      conditions: [{ attribute: "userId", value: userId }],
    });
    const rows = await Array.fromAsync(iter);
    return rows.find(row => row.advisorId === advisorId) || null;
  } catch (error) {
    throwStatus(
      `Failed to load private rating: ${(error as Error)?.message ?? error}`,
      500
    );
  }
}

/**
 * Converts a request body into bounded rating fields.
 * @param body - Parsed JSON request body.
 * @returns Sanitized rating payload.
 */
function ratingPayload(body: RatingBody): RatingPayload {
  return {
    ...Object.fromEntries(
      RATING_FIELDS.map(field => [field, boundedInt(body[field])])
    ),
    reviewText: textValue(body.reviewText, 1_000),
  };
}

/**
 * Bounds numeric ratings to the supported 1-5 range.
 * @param value - Candidate rating value.
 * @returns A valid integer rating or null.
 */
function boundedInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value), 10);
  return parsed >= 1 && parsed <= 5 ? parsed : null;
}

/**
 * Trims optional text input to the configured maximum.
 * @param value - Candidate text value.
 * @param max - Maximum retained characters.
 * @returns Trimmed text or null.
 */
function textValue(value: unknown, max: number): string | null {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

/**
 * Removes private row ownership fields before returning rating state.
 * @param row - Stored rating row.
 * @returns Public rating response row or null.
 */
function sanitizeRating(row: UserRatingRow | null): RatingResponseRow | null {
  if (!row) return null;
  return {
    advisorId: row.advisorId,
    ratingInt: row.ratingInt ?? null,
    responsiveness: row.responsiveness ?? null,
    transparency: row.transparency ?? null,
    performance: row.performance ?? null,
    planningDepth: row.planningDepth ?? null,
    reviewText: row.reviewText || "",
  };
}

/**
 * Writes a rating row through whichever table write method is available.
 * @param row - Complete row to persist.
 */
async function writeRow(row: UserRatingWritableRow): Promise<void> {
  const userRatings = userRatingTable();
  try {
    if (typeof userRatings.put === "function") {
      await userRatings.put(row);
      return;
    }
    if (typeof userRatings.insert === "function") {
      await userRatings.insert(row);
      return;
    }
    if (typeof userRatings.create === "function") {
      await userRatings.create(row);
      return;
    }
  } catch (error) {
    throwStatus(
      `Failed to save private rating: ${(error as Error)?.message ?? error}`,
      500
    );
  }
  throwStatus("UserRating writes are unavailable", 503);
}

// encodeURIComponent gives a non-lossy, collision-free encoding for the
// (userId, advisorId) pair — distinct inputs always produce distinct keys,
// and ':' is reserved by encodeURIComponent so the delimiter never collides
// with a real id character.
/**
 * Builds the deterministic primary key for a private rating row.
 * @param userId - Current user identifier.
 * @param advisorId - Advisor identifier.
 * @returns Encoded compound id.
 */
function ratingId(userId: string, advisorId: string): string {
  return `${encodeURIComponent(String(userId))}:${encodeURIComponent(String(advisorId))}`;
}

/**
 * Checks whether a method argument is the JSON rating payload.
 * @param value - Candidate method argument.
 * @returns True when the value contains rating fields.
 */
function isBody(value: unknown): value is RatingBody {
  return (
    isRecord(value) &&
    (RATING_FIELDS.some(f => f in value) || "reviewText" in value)
  );
}

/**
 * Checks whether a method argument is a route target.
 * @param value - Candidate method argument.
 * @returns True when the value is an object that is not the rating body.
 */
function isTarget(value: unknown): value is RatingTarget {
  return isRecord(value) && !isBody(value);
}

/**
 * Narrows unknown values to object records.
 * @param value - Candidate value.
 * @returns True when the value is a non-null object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === "object";
}

/**
 * Reads only string values from loose objects.
 * @param value - Candidate value.
 * @returns String value or an empty string.
 */
function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Narrows the ambient Harper table to the methods this resource uses.
 * @returns UserRating table facade.
 */
function userRatingTable(): UserRatingTable {
  return tables.UserRating as unknown as UserRatingTable;
}

/**
 * Throws an HTTP-like error object consumed by Harper.
 * @param message - Error message.
 * @param status - HTTP status code.
 */
function throwStatus(message: string, status: number): never {
  const error = new Error(message);
  // Harper's thrown-error response writer reads `statusCode` (falling back to
  // 500); `status` is kept for returned-response symmetry and callers/tests.
  Object.assign(error, { status, statusCode: status });
  throw error;
}
