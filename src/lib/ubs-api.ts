// @ts-nocheck
import type { UbsAdvisorEntity, UbsSearchResponse } from "./ubs-types.js";

/**
 * Builds the public UBS Broadridge Presenter search request body.
 * @param query - Bounded advisor name fragment.
 * @param maxResults - Maximum result count requested from the API.
 * @returns JSON body for the locator Search endpoint.
 */
export function buildUbsSearchBody(
  query: string,
  maxResults: number
): Record<string, unknown> {
  return {
    locator: "UBS",
    SearchRadius: 25,
    MaxResults: maxResults,
    DoFuzzyNameSearch: 0,
    Company: `%${query.trim()}`,
    ProfileTypes: "Individual",
  };
}

/**
 * Parses and validates the UBS search response envelope.
 * @param payload - JSON-decoded response from Broadridge Presenter.
 * @returns Individual advisor entities.
 */
export function parseUbsSearchResponse(
  payload: unknown
): ReadonlyArray<UbsAdvisorEntity> {
  if (!payload || typeof payload !== "object") {
    throw new Error("UBS search response was not a JSON object.");
  }
  const response = payload as UbsSearchResponse;
  if (!Array.isArray(response.Entity)) {
    throw new Error("UBS search response did not include Entity[].");
  }
  return response.Entity.filter(entity => entity?.ProfileType === "Individual");
}
