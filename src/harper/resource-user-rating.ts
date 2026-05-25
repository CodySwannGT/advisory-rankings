// @ts-nocheck
/* eslint-disable jsdoc/require-jsdoc -- Local helpers keep the public Resource methods readable. */
import { all } from "./resource-pagination.js";
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
  const rows = await all(tables.UserRating);
  return (
    rows.find(row => row.userId === userId && row.advisorId === advisorId) ||
    null
  );
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
  if (typeof tables.UserRating?.put === "function")
    return tables.UserRating.put(row);
  if (typeof tables.UserRating?.insert === "function")
    return tables.UserRating.insert(row);
  if (typeof tables.UserRating?.create === "function")
    return tables.UserRating.create(row);
  throwStatus("UserRating writes are unavailable", 503);
}

function ratingId(userId, advisorId) {
  return `${slug(userId)}:${slug(advisorId)}`;
}

function slug(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 120);
}

function isBody(value) {
  return (
    value && typeof value === "object" && RATING_FIELDS.some(f => f in value)
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
