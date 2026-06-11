import { check, type Check } from "./web_smoke_support.js";

interface SearchKindModeEvidence {
  readonly countHint: string;
  readonly firmModePressed: string | null;
  readonly visibleKinds: readonly (string | null)[];
}

interface SearchNavigationEvidence {
  readonly activeRows: number;
  readonly enterOpenedCleanPath: boolean;
  readonly enteredUrl: string;
}

interface GlobalSearchCheckOptions {
  readonly dropdownExpanded: boolean;
  readonly emptySearchChecks: readonly Check[];
  readonly kindMode: SearchKindModeEvidence;
  readonly multiWordFirmChecks: readonly Check[];
  readonly namedInputCount: number;
  readonly navigation: SearchNavigationEvidence;
  readonly resultCount: number;
  readonly supportedKinds: number;
}

/**
 * Builds global-search smoke assertions from browser-observed evidence.
 * @param options - Captured search state and nested check groups.
 * @returns Smoke assertions for global search.
 */
export function globalSearchChecks(
  options: GlobalSearchCheckOptions
): readonly Check[] {
  return [
    check(
      options.namedInputCount === 1,
      "global search: combobox exposes accessible name"
    ),
    check(
      options.dropdownExpanded,
      "global search: suggestions dropdown opens"
    ),
    check(
      options.resultCount >= 1,
      "global search: selectable suggestions render"
    ),
    check(
      options.supportedKinds >= 1,
      "global search: advisor, firm, or team result renders"
    ),
    ...options.multiWordFirmChecks,
    check(
      options.kindMode.firmModePressed === "true",
      "global search: kind mode toggle reflects selected mode"
    ),
    check(
      options.kindMode.visibleKinds.every(kind => kind === "firm"),
      "global search: firm mode renders firm-only rows",
      options.kindMode.visibleKinds.join(",")
    ),
    check(
      /firm matches/i.test(options.kindMode.countHint),
      "global search: count hint reflects selected kind",
      options.kindMode.countHint
    ),
    check(
      options.navigation.activeRows === 1,
      "global search: ArrowDown selects one result"
    ),
    check(
      options.navigation.enterOpenedCleanPath,
      "global search: Enter opens clean profile route",
      options.navigation.enteredUrl
    ),
    ...options.emptySearchChecks,
  ];
}
