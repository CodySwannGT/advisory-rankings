const FIRM_FILTER_FIELDS = ["firm", "firmId"] as const;
const SINGLE_VALUE_FILTER_FIELDS = ["state", "year", "direction"] as const;

/**
 * Builds the RecruitingMarket resource query from the current page search.
 * @param search - Browser location search string.
 * @param limit - Result limit to request.
 * @returns Resource query string, including the leading `?` when non-empty.
 */
export function buildRecruitingResourceQuery(
  search: string,
  limit: number
): string {
  const params = new URLSearchParams();
  const current = new URLSearchParams(search);
  appendRepeatedParams(params, current);
  appendSingleValueParams(params, current);
  params.set("limit", String(limit));
  return params.size ? `?${params}` : "";
}

/**
 * Copies multi-value firm filters from the current URL into the resource query.
 * @param params - Resource query parameters being built.
 * @param current - Current browser URL query parameters.
 */
function appendRepeatedParams(
  params: URLSearchParams,
  current: URLSearchParams
): void {
  for (const field of FIRM_FILTER_FIELDS) {
    for (const value of current.getAll(field)) {
      if (value) params.append(field, value);
    }
  }
}

/**
 * Copies single-value filters from the current URL into the resource query.
 * @param params - Resource query parameters being built.
 * @param current - Current browser URL query parameters.
 */
function appendSingleValueParams(
  params: URLSearchParams,
  current: URLSearchParams
): void {
  for (const field of SINGLE_VALUE_FILTER_FIELDS) {
    const value = current.get(field);
    if (value) params.set(field, value);
  }
}
