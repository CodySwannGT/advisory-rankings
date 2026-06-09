import { humanize } from "./app-formatters.js";
import { Button, FormLabel, SectionCard, el } from "./design-system/index.js";

/** URL-backed filter state for the public research queue. */
type QueueFilters = Readonly<
  Record<
    "sourceType" | "staleDays" | "status" | "missingField" | "limit",
    string
  >
>;

const DEFAULT_FILTERS: QueueFilters = {
  sourceType: "web_research",
  staleDays: "30",
  status: "",
  missingField: "",
  limit: "25",
};
const FILTER_FIELDS = [
  "sourceType",
  "staleDays",
  "status",
  "missingField",
  "limit",
] as const;
const STATUS_OPTIONS = ["", "new_data", "no_new_data", "failed"] as const;
const MISSING_FIELD_OPTIONS = [
  "",
  "headshotUrl",
  "businessPhone",
  "email",
  "website",
] as const;
const SOURCE_TYPE_OPTIONS = [
  "web_research",
  "brokercheck",
  "firm_source",
] as const;

/**
 * Reads current queue filters from the browser URL.
 * @returns Normalized filter values for form controls and resource requests.
 */
export function readQueueFilters(): QueueFilters {
  const params = new URLSearchParams(location.search);
  return {
    sourceType:
      cleanText(params.get("sourceType")) ?? DEFAULT_FILTERS.sourceType,
    staleDays: boundedTextNumber(
      params.get("staleDays"),
      DEFAULT_FILTERS.staleDays,
      1,
      3650
    ),
    status: cleanText(params.get("status")) ?? "",
    missingField: cleanText(params.get("missingField")) ?? "",
    limit: boundedTextNumber(
      params.get("limit"),
      DEFAULT_FILTERS.limit,
      1,
      100
    ),
  };
}

/**
 * Builds the queue resource path from normalized filters.
 * @param filters - Filters read from the URL or form.
 * @returns Resource path with query when the page URL is filtered.
 */
export function queueResourcePath(filters: QueueFilters): string {
  const params = new URLSearchParams(location.search);
  if (!FILTER_FIELDS.some(field => params.has(field))) {
    return "/AdvisorResearchQueue";
  }
  return `/AdvisorResearchQueue?${queueFilterParams(filters).toString()}`;
}

/**
 * Builds URL-backed queue filter controls.
 * @param filters - Current filters read from the browser URL.
 * @param onChange - Callback that reloads the queue after URL updates.
 * @returns Filter control card.
 */
export function filterControlsCard(
  filters: QueueFilters,
  onChange: () => void
): HTMLElement {
  return SectionCard({
    title: "Queue filters",
    attrs: { class: "research-queue-filter-card" },
    body: queueFilterForm(filters, onChange),
  });
}

/**
 * Builds the queue filter form element.
 * @param filters - Current filters read from the browser URL.
 * @param onChange - Callback that reloads the queue after URL updates.
 * @returns Filter form.
 */
function queueFilterForm(
  filters: QueueFilters,
  onChange: () => void
): HTMLFormElement {
  const form = el(
    "form",
    {
      class: "research-queue-filters",
      method: "get",
      action: "/research/freshness",
      onSubmit: (event: Event) => {
        event.preventDefault();
        applyQueueFilters(form, onChange);
      },
    },
    FormLabel({
      label: "Source type",
      control: selectControl("sourceType", filters.sourceType, [
        ...SOURCE_TYPE_OPTIONS,
      ]),
    }),
    numberLabel("Stale days", "staleDays", filters.staleDays, "3650"),
    FormLabel({
      label: "Status",
      control: selectControl("status", filters.status, [...STATUS_OPTIONS]),
    }),
    FormLabel({
      label: "Missing field",
      control: selectControl("missingField", filters.missingField, [
        ...MISSING_FIELD_OPTIONS,
      ]),
    }),
    numberLabel("Limit", "limit", filters.limit, "100"),
    filterActions(filters, onChange)
  ) as HTMLFormElement;
  return form;
}

/**
 * Builds a bounded number control wrapped in a form label.
 * @param label - Visible label text.
 * @param name - Filter field name.
 * @param value - Current field value.
 * @param max - Maximum accepted value.
 * @returns Number input label.
 */
function numberLabel(
  label: string,
  name: keyof QueueFilters,
  value: string,
  max: string
): HTMLElement {
  return FormLabel({
    label,
    control: el("input", {
      class: "ab-input",
      type: "number",
      name,
      min: "1",
      max,
      value,
    }),
  });
}

/**
 * Builds filter action buttons.
 * @param filters - Current filters read from the browser URL.
 * @param onChange - Callback that reloads the queue after URL updates.
 * @returns Action row.
 */
function filterActions(
  filters: QueueFilters,
  onChange: () => void
): HTMLElement {
  return el(
    "div",
    { class: "research-queue-filter-actions" },
    Button({ type: "submit", variant: "primary", children: "Apply" }),
    Button({
      variant: "neutral",
      onClick: () => {
        writeQueueFilters(DEFAULT_FILTERS);
        onChange();
      },
      children: "Clear",
      attrs: { disabled: hasActiveFilters(filters) ? undefined : true },
    })
  );
}

/**
 * Applies a form change to the URL and reloads the queue resource.
 * @param form - Filter form.
 * @param onChange - Callback that reloads the queue after URL updates.
 */
function applyQueueFilters(form: HTMLFormElement, onChange: () => void): void {
  writeQueueFilters(readQueueFilterForm(form));
  onChange();
}

/**
 * Reads filter values from the form.
 * @param form - Queue filter form.
 * @returns Normalized queue filters.
 */
function readQueueFilterForm(form: HTMLFormElement): QueueFilters {
  const data = new FormData(form);
  return {
    sourceType: cleanText(data.get("sourceType")) ?? DEFAULT_FILTERS.sourceType,
    staleDays: boundedTextNumber(
      data.get("staleDays"),
      DEFAULT_FILTERS.staleDays,
      1,
      3650
    ),
    status: cleanText(data.get("status")) ?? "",
    missingField: cleanText(data.get("missingField")) ?? "",
    limit: boundedTextNumber(data.get("limit"), DEFAULT_FILTERS.limit, 1, 100),
  };
}

/**
 * Writes queue filters into the browser URL without a full navigation.
 * @param filters - Normalized filters.
 */
function writeQueueFilters(filters: QueueFilters): void {
  const nextParams = new URLSearchParams(location.search);
  for (const field of FILTER_FIELDS) nextParams.delete(field);
  for (const [field, value] of queueFilterParams(filters)) {
    nextParams.set(field, value);
  }
  const query = nextParams.size ? `?${nextParams.toString()}` : "";
  const nextUrl = `${location.pathname}${query}${location.hash}`;
  const currentUrl = `${location.pathname}${location.search}${location.hash}`;
  if (nextUrl !== currentUrl) history.pushState(null, "", nextUrl);
}

/**
 * Converts filters to URL parameters.
 * @param filters - Normalized queue filters.
 * @returns Query parameters containing every supported queue filter.
 */
function queueFilterParams(filters: QueueFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const field of FILTER_FIELDS) params.set(field, filters[field]);
  return params;
}

/**
 * Renders a select control, keeping a URL-provided custom value visible.
 * @param name - Form field name.
 * @param value - Current field value.
 * @param options - Known option values.
 * @returns Select element.
 */
function selectControl(
  name: keyof QueueFilters,
  value: string,
  options: readonly string[]
): HTMLElement {
  const values = options.includes(value) ? options : [value, ...options];
  return el(
    "select",
    { class: "ab-input", name },
    ...values.map(optionValue =>
      el(
        "option",
        {
          value: optionValue,
          selected: optionValue === value ? "selected" : undefined,
        },
        optionValue ? (humanize(optionValue) ?? optionValue) : "Any"
      )
    )
  );
}

/**
 * Checks whether any filter differs from its default value.
 * @param filters - Normalized queue filters.
 * @returns True when the route is actively filtered.
 */
function hasActiveFilters(filters: QueueFilters): boolean {
  return FILTER_FIELDS.some(field => filters[field] !== DEFAULT_FILTERS[field]);
}

/**
 * Normalizes a raw text filter.
 * @param value - URL or form value.
 * @returns Trimmed text or null.
 */
function cleanText(value: FormDataEntryValue | string | null): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

/**
 * Normalizes bounded integer fields while keeping form values string-shaped.
 * @param value - URL or form value.
 * @param fallback - Fallback number string.
 * @param min - Inclusive minimum.
 * @param max - Inclusive maximum.
 * @returns Clamped integer as a string.
 */
function boundedTextNumber(
  value: FormDataEntryValue | string | null,
  fallback: string,
  min: number,
  max: number
): string {
  const parsed = Number(cleanText(value) ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return String(Math.min(max, Math.max(min, Math.trunc(parsed))));
}
