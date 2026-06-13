import { api } from "./app.js";
import { Button, clear, el } from "./design-system/index.js";

/** Design-system component signature normalized at this boundary. */
type Component = (...args: readonly unknown[]) => HTMLElement;

const ButtonComponent = Button as unknown as Component;

/** Search result shape consumed by the inline comparison add control. */
interface SearchResultItem {
  readonly kind?: string;
  readonly id?: string;
  readonly name?: string;
  readonly sub?: string | null;
}

/** Search response shape consumed by the inline comparison add control. */
interface SearchPayload {
  readonly items?: readonly SearchResultItem[];
}

/**
 * Builds an inline advisor search for adding another comparison column.
 * @param selectedIds - Currently selected advisor ids.
 * @returns Add-advisor control.
 */
export function compareAddAdvisorControl(
  selectedIds: readonly string[]
): HTMLElement {
  const input = el("input", {
    class: "comparison-add-input",
    type: "search",
    name: "q",
    autocomplete: "off",
    placeholder: "Search advisors",
    "aria-label": "Search advisors to add",
  }) as HTMLInputElement;
  const status = el("p", {
    class: "comparison-add-status",
    role: "status",
    "aria-live": "polite",
  });
  const results = el("div", { class: "comparison-add-results" });
  const form = compareAddAdvisorForm(input, selectedIds, status, results);

  return el(
    "div",
    { class: "comparison-add" },
    el("h3", {}, "Add another advisor"),
    form,
    status,
    results
  );
}

/**
 * Builds the add-advisor search form.
 * @param input - Search input node.
 * @param selectedIds - Currently selected advisor ids.
 * @param status - Live status node.
 * @param results - Search results container.
 * @returns Search form.
 */
function compareAddAdvisorForm(
  input: HTMLInputElement,
  selectedIds: readonly string[],
  status: HTMLElement,
  results: HTMLElement
): HTMLFormElement {
  const form = el(
    "form",
    { class: "comparison-add-form" },
    input,
    ButtonComponent({
      variant: "neutral",
      type: "submit",
      children: "Find",
      attrs: { class: "comparison-add-submit" },
    })
  ) as HTMLFormElement;

  form.addEventListener("submit", event => {
    event.preventDefault();
    void runCompareAdvisorSearch(input.value, selectedIds, status, results);
  });

  return form;
}

/**
 * Searches public advisor results and renders add buttons.
 * @param query - User-entered advisor query.
 * @param selectedIds - Currently selected advisor ids.
 * @param status - Live status node.
 * @param results - Search results container.
 */
async function runCompareAdvisorSearch(
  query: string,
  selectedIds: readonly string[],
  status: HTMLElement,
  results: HTMLElement
): Promise<void> {
  const q = query.trim();
  const params = new URLSearchParams({ kind: "advisor", limit: "5", q });
  const payload = q
    ? await api<SearchPayload>(`/Search?${params.toString()}`)
    : null;
  const selected = new Set(selectedIds);
  const items = (payload?.items ?? []).filter(
    item => item.kind === "advisor" && item.id && !selected.has(item.id)
  );

  clear(results);
  status.replaceChildren(searchStatus(q, items.length));
  results.append(
    ...items.map(item =>
      compareAddAdvisorResult(item, [...selectedIds, String(item.id)])
    )
  );
}

/**
 * Builds the user-facing search status text.
 * @param query - Trimmed query.
 * @param count - Number of addable advisor matches.
 * @returns Status text.
 */
function searchStatus(query: string, count: number): string {
  if (!query) return "Enter an advisor name.";
  if (!count) return "No additional advisors found.";
  return `${count} advisor ${count === 1 ? "match" : "matches"}`;
}

/**
 * Builds one add-advisor search result row.
 * @param item - Advisor search result.
 * @param nextIds - Comparison ids after adding this result.
 * @returns Search result row.
 */
function compareAddAdvisorResult(
  item: SearchResultItem,
  nextIds: readonly string[]
): HTMLElement {
  return el(
    "div",
    { class: "comparison-add-result" },
    el(
      "span",
      { class: "comparison-add-result-text" },
      el("strong", {}, item.name || item.id || "Advisor"),
      item.sub ? el("span", {}, item.sub) : null
    ),
    ButtonComponent({
      variant: "primary",
      type: "button",
      children: "Add",
      onClick: () => {
        window.location.href = `/compare?ids=${nextIds.map(encodeURIComponent).join(",")}`;
      },
      attrs: { class: "comparison-add-result-button" },
    })
  );
}
