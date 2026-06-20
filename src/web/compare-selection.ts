// URL-backed selection controls for the advisor comparison table.

import type {
  AdvisorComparisonItem,
  AdvisorComparisonPayload,
  AdvisorComparisonSelection,
} from "../types/advisor-comparison.js";
import { Button, Icon, el } from "./design-system/index.js";
import type { IconName } from "./design-system/index.js";

const IDS_PARAM = "ids";
const LEGACY_ADVISOR_IDS_PARAM = "advisorIds";

/** Selection mutation callback used by comparison column controls. */
export type ComparisonRender = (payload: AdvisorComparisonPayload) => void;

/** Result of toggling one advisor in a comparison selection. */
export interface ComparisonToggleResult {
  readonly ids: readonly string[];
  readonly capped: boolean;
}

/**
 * Builds the AdvisorComparison resource path from the current browser URL.
 * @returns Resource URL with the selected ids query when available.
 */
export function advisorComparisonPathFromLocation(): string {
  return advisorComparisonPathFromParams(new URLSearchParams(location.search));
}

/**
 * Builds the AdvisorComparison resource path from URL query params.
 * @param params - Current route query params.
 * @returns Resource URL with selected ids query when available.
 */
export function advisorComparisonPathFromParams(
  params: URLSearchParams
): string {
  const ids =
    selectedComparisonIdsFromParams(params).join(",") ??
    repeatedIds(params).join(",");
  const qs = new URLSearchParams();
  if (ids) qs.set(IDS_PARAM, ids);
  return qs.size ? `/AdvisorComparison?${qs.toString()}` : "/AdvisorComparison";
}

/**
 * Reads comparison ids from URL params using the canonical `ids` parameter,
 * falling back to the legacy `advisorIds` spelling and repeated `id` params.
 * @param params - Current route query params.
 * @returns Deduplicated advisor ids in URL order.
 */
export function selectedComparisonIdsFromParams(
  params: URLSearchParams
): readonly string[] {
  const raw =
    params.get(IDS_PARAM) ||
    params.get(LEGACY_ADVISOR_IDS_PARAM) ||
    repeatedIds(params).join(",");
  if (!raw) return [];
  return raw
    .split(",")
    .map(id => id.trim())
    .filter(Boolean)
    .filter((id, index, ids) => ids.indexOf(id) === index);
}

/**
 * Toggles an advisor id in a comparison selection while preserving URL order
 * and respecting the AdvisorComparison resource cap.
 * @param ids - Existing selected advisor ids.
 * @param advisorId - Advisor id being toggled.
 * @param max - Maximum selectable advisors.
 * @returns Next ids plus a cap flag when selection was blocked.
 */
export function toggleComparisonId(
  ids: readonly string[],
  advisorId: string,
  max: number = 4
): ComparisonToggleResult {
  if (ids.includes(advisorId)) {
    return { ids: ids.filter(id => id !== advisorId), capped: false };
  }
  if (ids.length >= max) return { ids, capped: true };
  return { ids: [...ids, advisorId], capped: false };
}

/**
 * Builds human-readable selection caveats from a normalized comparison payload.
 * @param selection - AdvisorComparison selection metadata.
 * @returns Caveat lines, or an empty array when the selection is ready.
 */
export function comparisonSelectionDetails(
  selection: AdvisorComparisonSelection
): readonly string[] {
  return [
    selection.status === "under_limit"
      ? `Add at least ${selection.min} advisors for a complete comparison.`
      : null,
    selection.truncated
      ? `Showing the first ${selection.max} advisors from this URL.`
      : null,
    selection.duplicateIds.length
      ? `Duplicate ids ignored: ${selection.duplicateIds.join(", ")}.`
      : null,
    selection.missingIds.length
      ? `Missing ids: ${selection.missingIds.join(", ")}.`
      : null,
  ].filter((detail): detail is string => Boolean(detail));
}

/**
 * Builds one advisor column header with URL-backed selection controls.
 * @param item - Compared advisor item.
 * @param index - Column index.
 * @param count - Total visible advisor columns.
 * @param actions - Selection mutation callbacks.
 * @returns Table header cell.
 */
export function comparisonColumnHeader(
  item: AdvisorComparisonItem,
  index: number,
  count: number,
  actions: ComparisonColumnActions
): HTMLElement {
  return el(
    "th",
    { scope: "col", "data-advisor-id": item.id },
    el("span", { class: "comparison-name" }, item.displayName),
    el("span", { class: "comparison-firm" }, actions.firmName(item)),
    el(
      "div",
      { class: "comparison-column-controls", role: "group" },
      comparisonControlButton({
        label: `Move ${item.displayName} left`,
        className: "comparison-move-left",
        disabled: index === 0,
        icon: "arrow-left",
        onClick: () => actions.move(item.id, -1),
      }),
      comparisonControlButton({
        label: `Move ${item.displayName} right`,
        className: "comparison-move-right",
        disabled: index === count - 1,
        icon: "arrow-right",
        onClick: () => actions.move(item.id, 1),
      }),
      comparisonControlButton({
        label: `Remove ${item.displayName}`,
        className: "comparison-remove",
        disabled: count <= 1,
        icon: "x",
        onClick: () => actions.remove(item.id),
      })
    )
  );
}

/**
 * Updates the shareable comparison URL and rerenders ordered columns.
 * @param render - Callback that renders the next payload.
 * @param payload - Current comparison payload.
 * @param items - Next ordered advisor columns.
 */
export function updateComparisonSelection(
  render: ComparisonRender,
  payload: AdvisorComparisonPayload,
  items: readonly AdvisorComparisonItem[]
): void {
  const nextPayload = comparisonPayloadWithItems(payload, dedupeItems(items));
  history.replaceState(null, "", comparisonUrl(nextPayload.ids));
  render(nextPayload);
}

/**
 * Builds the report packet URL for the current ordered comparison selection.
 * @param ids - Ordered advisor ids.
 * @returns Path and query string for the report packet route.
 */
export function reportPacketUrl(ids: readonly string[]): string {
  const qs = new URLSearchParams();
  if (ids.length) qs.set(IDS_PARAM, ids.join(","));
  return qs.size ? `/report-packet?${qs.toString()}` : "/report-packet";
}

/**
 * Moves one advisor column left or right, clamping at table boundaries.
 * @param items - Current advisor columns.
 * @param id - Advisor id to move.
 * @param direction - Direction to move.
 * @returns Reordered advisor columns.
 */
export function moveComparisonItem(
  items: readonly AdvisorComparisonItem[],
  id: string,
  direction: -1 | 1
): readonly AdvisorComparisonItem[] {
  const index = items.findIndex(item => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

/** Comparison table column selection actions. */
export interface ComparisonColumnActions {
  readonly remove: (id: string) => void;
  readonly move: (id: string, direction: -1 | 1) => void;
  readonly firmName: (item: AdvisorComparisonItem) => string;
}

/** Compact comparison column control button options. */
interface ComparisonControlButtonOptions {
  readonly label: string;
  readonly className: string;
  readonly disabled: boolean;
  readonly icon: IconName;
  readonly onClick: EventListener;
}

/**
 * Builds one compact comparison column control button.
 * @param root0 - Control rendering options.
 * @param root0.label - Accessible button label.
 * @param root0.className - Extra button class.
 * @param root0.disabled - Whether the control is disabled.
 * @param root0.icon - Visible button icon.
 * @param root0.onClick - Click handler.
 * @returns Rendered button.
 */
function comparisonControlButton({
  label,
  className,
  disabled,
  icon,
  onClick,
}: ComparisonControlButtonOptions): HTMLElement {
  return Button({
    variant: "ghost",
    children: Icon({ name: icon }),
    onClick,
    attrs: {
      class: `comparison-control ${className}`,
      "aria-label": label,
      title: label,
      disabled,
    },
  });
}

/**
 * Preserves the first occurrence of each advisor id.
 * @param items - Candidate advisor columns.
 * @returns De-duplicated advisor columns.
 */
function dedupeItems(
  items: readonly AdvisorComparisonItem[]
): readonly AdvisorComparisonItem[] {
  return items.filter(
    (item, index) =>
      items.findIndex(candidate => candidate.id === item.id) === index
  );
}

/**
 * Builds a payload copy that reflects the current visible advisor order.
 * @param payload - Current comparison payload.
 * @param items - Next visible advisor columns.
 * @returns Payload synchronized with the visible selection.
 */
function comparisonPayloadWithItems(
  payload: AdvisorComparisonPayload,
  items: readonly AdvisorComparisonItem[]
): AdvisorComparisonPayload {
  const ids = items.map(item => item.id);
  const status = ids.length < payload.selection.min ? "under_limit" : "ready";
  return {
    ...payload,
    count: items.length,
    ids,
    items,
    selection: {
      ...payload.selection,
      status,
      requestedIds: ids,
      normalizedIds: ids,
      cappedIds: ids,
      duplicateIds: [],
      missingIds: items
        .filter(item => item.status === "not_found")
        .map(item => item.id),
      truncated: false,
    },
  };
}

/**
 * Builds a canonical shareable comparison URL for the selected advisor ids.
 * @param ids - Ordered advisor ids.
 * @returns Path and query string for the comparison route.
 */
export function comparisonUrl(ids: readonly string[]): string {
  if (!ids.length) return "/compare";
  return `/compare?ids=${ids.map(encodeURIComponent).join(",")}`;
}

/**
 * Reads repeated id params from a URLSearchParams bag.
 * @param params - Current location params.
 * @returns Repeated id values.
 */
function repeatedIds(params: URLSearchParams): readonly string[] {
  return params
    .getAll("id")
    .map(id => id.trim())
    .filter(Boolean);
}
