// @ts-nocheck
/* eslint-disable jsdoc/require-jsdoc -- Local helpers keep the public Resource methods readable. */
import { normalizeId } from "./resource-routing.js";

const RATING_FIELDS = [
  "ratingInt",
  "responsiveness",
  "transparency",
  "performance",
  "planningDepth",
];

/** User-scoped private rating for one advisor. */
export class AdvisorRating extends Resource {
  /**
   * Lets the page learn whether the current visitor has a private rating.
   * @returns True because signed-out reads return an empty private state.
   */
  allowRead() {
    return true;
  }

  /**
   * Allows signed-in users to save their own private rating.
   * @returns True because authorization is enforced per request.
   */
  allowCreate() {
    return true;
  }

  /**
   * Loads only the current user's private rating for one advisor.
   * @param target - Route target containing advisor id.
   * @returns User-scoped rating state.
   */
  async get(target) {
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
  async post(...args) {
    const body = args.find(isBody) || {};
    const advisorId = normalizeAdvisorId(args.find(isTarget) || body);
    if (!advisorId) throwStatus("advisor id required", 400);
    const userId = currentUserId(this);
    if (!userId) throwStatus("Sign in required", 401);
    const row = {
      ...(await findRating(userId, advisorId)),
      ...ratingPayload(body),
      id: ratingId(userId, advisorId),
      advisorId,
      userId,
    };
    await writeRow(row);
    return { authenticated: true, rating: sanitizeRating(row) };
  }
}

function normalizeAdvisorId(value) {
  return normalizeId(value) || value?.advisorId || value?.id || "";
}

function currentUserId(resource) {
  const user = resource.getCurrentUser?.();
  return user?.id || user?.email || user?.username || null;
}

async function findRating(userId, advisorId) {
  const id = ratingId(userId, advisorId);
  try {
    if (typeof tables.UserRating?.get === "function") {
      const row = await tables.UserRating.get(id);
      if (!row) return null;
      // Defense-in-depth: ignore a row whose owner/advisor doesn't match
      // the requested pair (should be impossible with our derived id, but
      // protects against legacy rows or hash-collision-resistant changes).
      if (row.userId !== userId || row.advisorId !== advisorId) return null;
      return row;
    }
    // Fallback for environments without primary-key get (kept for the in-process
    // test fixture). Filter by indexed userId rather than scanning every row.
    const iter = tables.UserRating.search({
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

function ratingPayload(body) {
  return {
    ...Object.fromEntries(
      RATING_FIELDS.map(field => [field, boundedInt(body[field])])
    ),
    reviewText: textValue(body.reviewText, 1_000),
  };
}

function boundedInt(value) {
  const parsed = Number.parseInt(value, 10);
  return parsed >= 1 && parsed <= 5 ? parsed : null;
}

function textValue(value, max) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function sanitizeRating(row) {
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

async function writeRow(row) {
  try {
    if (typeof tables.UserRating?.put === "function")
      return await tables.UserRating.put(row);
    if (typeof tables.UserRating?.insert === "function")
      return await tables.UserRating.insert(row);
    if (typeof tables.UserRating?.create === "function")
      return await tables.UserRating.create(row);
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
function ratingId(userId, advisorId) {
  return `${encodeURIComponent(String(userId))}:${encodeURIComponent(String(advisorId))}`;
}

function isBody(value) {
  return (
    value &&
    typeof value === "object" &&
    (RATING_FIELDS.some(f => f in value) || "reviewText" in value)
  );
}

function isTarget(value) {
  return value && typeof value === "object" && !isBody(value);
}

function throwStatus(message, status) {
  const error = new Error(message);
  Object.assign(error, { status });
  throw error;
}
/* eslint-enable jsdoc/require-jsdoc -- Local helpers keep the public Resource methods readable. */
