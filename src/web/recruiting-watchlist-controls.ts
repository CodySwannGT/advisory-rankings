/** Creates one editable firm row. */
export type FirmRowFactory = (value: string, index: number) => HTMLElement;

const FIRM_INPUT_SELECTOR = 'input[name="firm"]';
const WATCHLIST_ADD_BUTTON_SELECTOR = ".watchlist-add-button";
const WATCHLIST_FIRMS_SELECTOR = "[data-watchlist-firms]";
const WATCHLIST_REMOVE_BUTTON_SELECTOR = ".watchlist-remove-button";
const WATCHLIST_ROW_SELECTOR = ".watchlist-firm-row";

/**
 * Enables add/remove controls for repeated firm inputs.
 * @param form - Recruiting filter form.
 * @param createFirmRow - Firm row factory.
 */
export function wireWatchlistControls(
  form: HTMLElement,
  createFirmRow: FirmRowFactory
): void {
  syncWatchlistAddButton(form);
  form.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const group = form.querySelector<HTMLElement>(WATCHLIST_FIRMS_SELECTOR);
    if (!group) return;
    if (target.closest(WATCHLIST_ADD_BUTTON_SELECTOR)) {
      addFirmRow(form, group, createFirmRow);
    }
    if (target.closest(WATCHLIST_REMOVE_BUTTON_SELECTOR)) {
      target.closest(WATCHLIST_ROW_SELECTOR)?.remove();
      resetFirmRows(form, group, createFirmRow);
    }
  });
  form.addEventListener("input", event => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches(FIRM_INPUT_SELECTOR)) {
      syncWatchlistAddButton(form);
    }
  });
}

/**
 * Appends a blank firm row when the current row is a selected suggestion.
 * @param form - Recruiting filter form.
 * @param group - Firm control group.
 * @param createFirmRow - Firm row factory.
 */
function addFirmRow(
  form: HTMLElement,
  group: HTMLElement,
  createFirmRow: FirmRowFactory
): void {
  if (!canAddFirmRow(form, group)) {
    syncWatchlistAddButton(form);
    return;
  }
  const addButton = group.querySelector<HTMLElement>(
    WATCHLIST_ADD_BUTTON_SELECTOR
  );
  group.insertBefore(
    createFirmRow("", group.querySelectorAll(FIRM_INPUT_SELECTOR).length),
    addButton
  );
  syncWatchlistAddButton(form);
}

/**
 * Rebuilds repeated firm rows so labels stay stable after removal.
 * @param form - Recruiting filter form.
 * @param group - Firm control group.
 * @param createFirmRow - Firm row factory.
 */
function resetFirmRows(
  form: HTMLElement,
  group: HTMLElement,
  createFirmRow: FirmRowFactory
): void {
  const inputs = [
    ...group.querySelectorAll<HTMLInputElement>(FIRM_INPUT_SELECTOR),
  ];
  const values = inputs.map(input => input.value);
  const addButton = group.querySelector<HTMLElement>(
    WATCHLIST_ADD_BUTTON_SELECTOR
  );
  const rows = (values.length ? values : [""]).map((value, index) =>
    createFirmRow(value, index)
  );
  group.replaceChildren(...rows, ...(addButton ? [addButton] : []));
  syncWatchlistAddButton(form);
}

/**
 * Enables Add firm only when the current row matches a known suggestion.
 * @param form - Recruiting filter form.
 */
function syncWatchlistAddButton(form: HTMLElement): void {
  const group = form.querySelector<HTMLElement>(WATCHLIST_FIRMS_SELECTOR);
  const addButton = group?.querySelector<HTMLButtonElement>(
    WATCHLIST_ADD_BUTTON_SELECTOR
  );
  if (!group || !addButton) return;
  Object.assign(addButton, { disabled: !canAddFirmRow(form, group) });
}

/**
 * Checks whether another firm row can be added from the current row.
 * @param form - Recruiting filter form.
 * @param group - Firm control group.
 * @returns True when the last input is an exact suggestion.
 */
function canAddFirmRow(form: HTMLElement, group: HTMLElement): boolean {
  const inputs = [
    ...group.querySelectorAll<HTMLInputElement>(FIRM_INPUT_SELECTOR),
  ];
  const current = inputs.at(-1)?.value.trim() ?? "";
  return current.length > 0 && firmSuggestionValues(form).has(current);
}

/**
 * Reads exact firm suggestion values available to the datalist.
 * @param form - Recruiting filter form.
 * @returns Suggested firm names.
 */
function firmSuggestionValues(form: HTMLElement): ReadonlySet<string> {
  const options = form.querySelectorAll<HTMLOptionElement>("datalist option");
  return new Set([...options].map(option => option.value.trim()));
}
