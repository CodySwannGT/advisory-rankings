const DEFAULT_LIMIT = 25;

export const BRANCH_FILTER_KEYS = [
  "q",
  "firm",
  "state",
  "city",
  "sourceType",
  "level",
  "minAdvisorCount",
] as const;

/**
 *
 */
export type BranchFilterKey = (typeof BRANCH_FILTER_KEYS)[number];
/**
 *
 */
export type BranchFilters = Readonly<Record<BranchFilterKey, string>>;

export const readBranchFilters = (): BranchFilters => {
  const params = new URLSearchParams(location.search);
  return filtersFromEntries(key => params.get(key)?.trim() ?? "");
};

export const formBranchFilters = (form: HTMLFormElement): BranchFilters => {
  const data = new FormData(form);
  return filtersFromEntries(key => String(data.get(key) ?? "").trim());
};

export const writeBranchFilters = (filters: BranchFilters): void => {
  const params = branchFilterParams(filters);
  const query = params.toString();
  history.pushState(null, "", query ? `/branches?${query}` : "/branches");
};

export const resourcePath = (
  filters: BranchFilters,
  cursor?: string
): string => {
  const params = branchFilterParams(filters);
  params.set("limit", String(DEFAULT_LIMIT));
  if (cursor) params.set("cursor", cursor);
  return `/PublicBranches?${params}`;
};

export const firmBranchExplorerHref = (firmId: string): string => {
  return `/branches?${new URLSearchParams({ firm: firmId })}`;
};

export const emptyBranchFilters = (): BranchFilters => {
  return filtersFromEntries(() => "");
};

export const hasActiveBranchFilters = (filters: BranchFilters): boolean => {
  return BRANCH_FILTER_KEYS.some(key => Boolean(filters[key]));
};

export const branchFilterLabel = (key: BranchFilterKey): string => {
  const labels: Readonly<Record<BranchFilterKey, string>> = {
    q: "Search",
    firm: "Firm",
    state: "State",
    city: "City or market",
    sourceType: "Source type",
    level: "Level",
    minAdvisorCount: "Minimum advisors",
  };
  return labels[key];
};

const branchFilterParams = (filters: BranchFilters): URLSearchParams => {
  const params = new URLSearchParams();
  BRANCH_FILTER_KEYS.forEach(key => {
    if (filters[key]) params.set(key, filters[key]);
  });
  return params;
};

const filtersFromEntries = (
  valueOf: (key: BranchFilterKey) => string
): BranchFilters => {
  return BRANCH_FILTER_KEYS.reduce<Partial<Record<BranchFilterKey, string>>>(
    (filters, key) => ({ ...filters, [key]: valueOf(key) }),
    {}
  ) as BranchFilters;
};
