import type {
  AdvisorRow,
  EmploymentHistoryRow,
  FirmRow,
  TeamRow,
} from "../types/harper-schema.js";
import type { RouteTarget } from "../types/harper-resource.js";
import { advisorDisplayName } from "./resource-routing.js";
import type {
  AdvisorDirectoryFilters,
  CandidateValue,
  FirmDirectoryFilters,
  SearchKind,
  TeamDirectoryFilters,
} from "./resource-directory-types.js";

/** Minimal target shape for query-param reads. */
interface QueryTarget {
  readonly get?: (name: string) => unknown;
}

/**
 * Parses the optional search-kind filter used by public `/Search` requests.
 * @param target - Request target carrying an optional `kind` query param.
 * @returns A bounded search kind, defaulting to `all` for missing/invalid input.
 */
export function parseSearchKind(target: RouteTarget | undefined): SearchKind {
  const kind = String(queryValue(target, "kind") || "all")
    .trim()
    .toLowerCase();
  return isSearchKind(kind) ? kind : "all";
}

/**
 * Parses advisor directory filters from public query parameters.
 * @param target - Request target carrying URL search params.
 * @returns Normalized advisor filter values.
 */
export function parseAdvisorDirectoryFilters(
  target: RouteTarget | undefined
): AdvisorDirectoryFilters {
  return {
    q: normalizedParam(target, "q"),
    firm: normalizedParam(target, "firm"),
    careerStatus: normalizedParam(target, "careerStatus"),
    hasCrd: booleanParam(target, "hasCrd"),
  };
}

/**
 * Parses firm directory filters from public query parameters.
 * @param target - Request target carrying URL search params.
 * @returns Normalized firm filter values.
 */
export function parseFirmDirectoryFilters(
  target: RouteTarget | undefined
): FirmDirectoryFilters {
  return {
    q: normalizedParam(target, "q"),
    channel: normalizedParam(target, "channel"),
    state: normalizedParam(target, "state"),
    active: activeParam(target),
  };
}

/**
 * Parses team directory filters from public query parameters.
 * @param target - Request target carrying URL search params.
 * @returns Normalized team filter values.
 */
export function parseTeamDirectoryFilters(
  target: RouteTarget | undefined
): TeamDirectoryFilters {
  return {
    q: normalizedParam(target, "q"),
    firm: normalizedParam(target, "firm"),
    serviceModel: normalizedParam(target, "serviceModel"),
  };
}

/**
 * Checks an advisor against supported public directory filters.
 * @param advisor - Advisor row from the public table.
 * @param filters - Normalized advisor filters.
 * @param currentFirmByAdvisor - Current-employment lookup keyed by advisor ID.
 * @param byFirm - Canonical firm lookup keyed by firm ID.
 * @returns Whether the advisor should be included in the response.
 */
export function advisorMatchesFilters(
  advisor: AdvisorRow,
  filters: AdvisorDirectoryFilters,
  currentFirmByAdvisor: ReadonlyMap<string, EmploymentHistoryRow>,
  byFirm: ReadonlyMap<string, FirmRow>
): boolean {
  const employment = currentFirmByAdvisor.get(advisor.id);
  const firm = employment ? byFirm.get(employment.firmId) : null;
  return (
    textMatches(filters.q, [
      advisorDisplayName(advisor),
      advisor.legalName,
      advisor.preferredName,
      advisor.firstName,
      advisor.lastName,
    ]) &&
    textMatches(filters.firm, [employment?.firmId, firm?.id, firm?.name]) &&
    exactMatches(filters.careerStatus, advisor.careerStatus) &&
    booleanMatches(filters.hasCrd, Boolean(advisor.finraCrd))
  );
}

/**
 * Checks a firm against supported public directory filters.
 * @param firm - Canonical firm row.
 * @param filters - Normalized firm filters.
 * @returns Whether the firm should be included in the response.
 */
export function firmMatchesFilters(
  firm: FirmRow,
  filters: FirmDirectoryFilters
): boolean {
  return (
    textMatches(filters.q, [firm.name, firm.legalName]) &&
    exactMatches(filters.channel, firm.channel) &&
    exactMatches(filters.state, firm.hqState) &&
    booleanMatches(filters.active, !firm.dissolvedYear)
  );
}

/**
 * Checks a team against supported public directory filters.
 * @param team - Team row.
 * @param filters - Normalized team filters.
 * @param byFirm - Canonical firm lookup keyed by firm ID.
 * @returns Whether the team should be included in the response.
 */
export function teamMatchesFilters(
  team: TeamRow,
  filters: TeamDirectoryFilters,
  byFirm: ReadonlyMap<string, FirmRow>
): boolean {
  const firm = team.currentFirmId ? byFirm.get(team.currentFirmId) : null;
  return (
    textMatches(filters.q, [team.name]) &&
    textMatches(filters.firm, [team.currentFirmId, firm?.id, firm?.name]) &&
    exactMatches(filters.serviceModel, team.serviceModel)
  );
}

/**
 * Checks whether a raw query value is a concrete entity search kind.
 * @param kind - Normalized search kind candidate.
 * @returns True when the value is a supported entity kind.
 */
function isSearchKind(kind: string): kind is Exclude<SearchKind, "all"> {
  return kind === "firm" || kind === "advisor" || kind === "team";
}

/**
 * Reads a lowercased string query parameter.
 * @param target - Request target carrying URL search params.
 * @param name - Query parameter name.
 * @returns Normalized value, or empty string when absent.
 */
function normalizedParam(
  target: RouteTarget | undefined,
  name: string
): string {
  return String(queryValue(target, name) || "")
    .trim()
    .toLowerCase();
}

/**
 * Reads a raw query value from a route target.
 * @param target - Request target carrying URL search params.
 * @param name - Query parameter name.
 * @returns Raw query value, or null when the target has no query reader.
 */
export function queryValue(
  target: RouteTarget | undefined,
  name: string
): unknown {
  if (typeof target !== "object" || target === null) return null;
  const queryTarget = target as QueryTarget;
  return typeof queryTarget.get === "function" ? queryTarget.get(name) : null;
}

/**
 * Parses boolean-like query parameters.
 * @param target - Request target carrying URL search params.
 * @param name - Query parameter name.
 * @returns Boolean filter, or null when absent/invalid.
 */
function booleanParam(
  target: RouteTarget | undefined,
  name: string
): boolean | null {
  const value = normalizedParam(target, name);
  if (["true", "1", "yes"].includes(value)) return true;
  if (["false", "0", "no"].includes(value)) return false;
  return null;
}

/**
 * Parses the active/dissolved firm status filter.
 * @param target - Request target carrying URL search params.
 * @returns Active-state filter, or null when absent/invalid.
 */
function activeParam(target: RouteTarget | undefined): boolean | null {
  const active = booleanParam(target, "active");
  if (active !== null) return active;
  const status = normalizedParam(target, "status");
  if (status === "active") return true;
  if (["dissolved", "inactive"].includes(status)) return false;
  return null;
}

/**
 * Applies case-insensitive substring matching across candidate fields.
 * @param query - Normalized query string.
 * @param values - Candidate values.
 * @returns True when the query is empty or a candidate contains it.
 */
function textMatches(
  query: string,
  values: ReadonlyArray<CandidateValue>
): boolean {
  return !query || values.some(value => normalizeValue(value).includes(query));
}

/**
 * Applies case-insensitive exact matching.
 * @param query - Normalized query string.
 * @param value - Candidate value.
 * @returns True when the query is empty or equals the normalized value.
 */
function exactMatches(
  query: string,
  value: string | number | boolean | null | undefined
): boolean {
  return !query || normalizeValue(value) === query;
}

/**
 * Applies optional boolean matching.
 * @param expected - Desired boolean value.
 * @param actual - Candidate boolean value.
 * @returns True when no boolean filter is active or the value matches.
 */
function booleanMatches(expected: boolean | null, actual: boolean): boolean {
  return expected === null || actual === expected;
}

/**
 * Normalizes arbitrary row values for filter comparison.
 * @param value - Candidate row value.
 * @returns Lowercased string value.
 */
function normalizeValue(value: CandidateValue): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
