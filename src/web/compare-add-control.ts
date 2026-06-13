import { search, type SearchItem } from "./app.js";
import { comparisonUrl } from "./compare-selection.js";
import { Button, el } from "./design-system/index.js";

/** Design-system component signature normalized at this boundary. */
type Component = (...args: readonly unknown[]) => HTMLElement;

const ButtonComponent = Button as unknown as Component;

const searchTimers = new WeakMap<
  HTMLInputElement,
  ReturnType<typeof setTimeout>
>();
const searchRequestIds = new WeakMap<HTMLInputElement, number>();

/** Inputs needed to process one inline add search event. */
interface CompareAddInputContext {
  readonly input: HTMLInputElement;
  readonly results: HTMLElement;
  readonly selectedIds: readonly string[];
  readonly status: HTMLElement;
}

/**
 * Builds an inline advisor search control for under-limit comparisons.
 * @param selectedIds - Advisor ids already in the comparison URL.
 * @returns Search/add control.
 */
export function compareInlineAddControl(
  selectedIds: readonly string[]
): HTMLElement {
  const status = el("p", {
    class: "comparison-add-status",
    role: "status",
    "aria-live": "polite",
  });
  const results = el("div", {
    class: "comparison-add-results",
    role: "listbox",
    "aria-label": "Advisor search results",
  });
  const input = el("input", {
    class: "comparison-add-input",
    type: "search",
    placeholder: "Search advisors to add",
    autocomplete: "off",
    "aria-label": "Search advisors to add",
  }) as HTMLInputElement;

  input.addEventListener("input", () => {
    handleCompareAddInput({
      input,
      results,
      selectedIds,
      status,
    });
  });

  return el("div", { class: "comparison-add-control" }, input, results, status);
}

/**
 * Handles one search-box input event with debounce and stale-response guards.
 * @param root0 - Inline add control state.
 * @param root0.input - Search input element.
 * @param root0.results - Result list container.
 * @param root0.selectedIds - Advisor ids already selected.
 * @param root0.status - Live status node.
 */
function handleCompareAddInput({
  input,
  results,
  selectedIds,
  status,
}: CompareAddInputContext): void {
  const previousTimer = searchTimers.get(input);
  const currentRequestId = (searchRequestIds.get(input) ?? 0) + 1;
  const q = input.value.trim();

  if (previousTimer) clearTimeout(previousTimer);
  searchRequestIds.set(input, currentRequestId);
  results.replaceChildren();
  status.replaceChildren(q.length < 2 ? "Enter at least 2 characters." : "");
  if (q.length < 2) return;
  searchTimers.set(
    input,
    setTimeout(async () => {
      const envelope = await search(q, "advisor").catch(() => null);
      if (currentRequestId !== searchRequestIds.get(input)) return;
      const advisors = (envelope?.items ?? []).filter(
        item => item.kind === "advisor" && !selectedIds.includes(item.id)
      );
      if (!advisors.length) {
        status.replaceChildren("No additional advisors found.");
        return;
      }
      status.replaceChildren("");
      results.replaceChildren(
        ...advisors.slice(0, 6).map(item => compareAddResult(item, selectedIds))
      );
    }, 150)
  );
}

/**
 * Builds one advisor search result button.
 * @param item - Search hit from `/Search`.
 * @param selectedIds - Existing comparison ids.
 * @returns Add result row.
 */
function compareAddResult(
  item: SearchItem,
  selectedIds: readonly string[]
): HTMLElement {
  return ButtonComponent({
    variant: "neutral",
    children: `${item.name}${item.sub ? ` - ${item.sub}` : ""}`,
    onClick: () => {
      window.location.href = comparisonUrl([...selectedIds, item.id]);
    },
    attrs: {
      class: "comparison-add-result",
      type: "button",
      role: "option",
    },
  });
}
