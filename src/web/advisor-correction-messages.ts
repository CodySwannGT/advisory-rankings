import { isAuthFailure } from "./app.js";

/**
 * Builds submit-failure copy for correction requests.
 * @param error - Request failure thrown by the API client.
 * @returns User-facing status text.
 */
export const correctionFailureMessage = (error: unknown): string =>
  isAuthFailure(error)
    ? "Sign in again to submit corrections."
    : "Could not queue correction request.";
