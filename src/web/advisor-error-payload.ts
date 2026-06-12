// Advisor profile error payload helpers.

import type { AdvisorProfilePayload } from "../types/advisor-profile.js";

/** Error envelope shape returned by AdvisorProfile when the record is missing. */
export interface ErrorPayload {
  readonly error: unknown;
  readonly id?: string;
}

/**
 * Discriminates a not-found error envelope from a normal advisor payload.
 * @param payload - Resource response under inspection.
 * @returns Whether the payload represents a not-found or error envelope.
 */
export function isErrorPayload(
  payload: AdvisorProfilePayload | ErrorPayload
): payload is ErrorPayload {
  return typeof payload === "object" && payload !== null && "error" in payload;
}
