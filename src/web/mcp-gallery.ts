import { api, refreshMe, logout, search, fmtDate } from "./app.js";
import {
  EmptyCard,
  SectionCard,
  SkeletonCard,
  Tag,
  clear,
  el,
  mountThreeColumnPage,
} from "./design-system/index.js";
import {
  queryTemplatesCard,
  setupSnippetsCard,
} from "./mcp-gallery-content.js";
import type { McpCatalogResponse } from "../harper/resource-mcp-catalog.js";

/** Callable adapter for untyped design-system components. */
type DesignSystemComponent = (...args: ReadonlyArray<unknown>) => HTMLElement;

/** Minimal catalog entry fields displayed by the public gallery. */
interface CatalogEntry {
  readonly name?: string;
  readonly title?: string;
  readonly description?: string;
  readonly uriTemplate?: string;
}

const SectionCardC = SectionCard as unknown as DesignSystemComponent;
const EmptyCardC = EmptyCard as unknown as DesignSystemComponent;
const SkeletonCardC = SkeletonCard as unknown as DesignSystemComponent;
const TagC = Tag as unknown as DesignSystemComponent;
const CATALOG_RESOURCE = "/McpCatalog";
const RAIL_STACK_CLASS = "mcp-gallery-rail-stack";

mountThreeColumnPage({
  active: "mcp-gallery",
  refreshMe,
  logout,
  search,
  pageTitle: "MCP Gallery",
  build({ center, right }) {
    center.append(SkeletonCardC(), SkeletonCardC());
    loadCatalog(center, right);
  },
});

/**
 * Loads the public MCP catalog resource.
 * @param center - Main route column.
 * @param right - Right rail column.
 */
function loadCatalog(center: HTMLElement, right: HTMLElement): void {
  api<McpCatalogResponse>(CATALOG_RESOURCE)
    .then(catalog => {
      clear(center);
      clear(right);
      renderCatalog(catalog, center, right);
    })
    .catch((error: unknown) => renderLoadError(error, center));
}

/**
 * Renders the public gallery from the same-origin catalog payload.
 * @param catalog - Public MCP catalog response.
 * @param center - Main route column.
 * @param right - Right rail column.
 */
function renderCatalog(
  catalog: McpCatalogResponse,
  center: HTMLElement,
  right: HTMLElement
): void {
  center.appendChild(headerCard(catalog));
  center.appendChild(endpointCard(catalog));
  if (catalog.status === "unavailable") {
    center.appendChild(unavailableCard(catalog));
  } else {
    center.appendChild(queryTemplatesCard(SectionCardC, TagC));
    center.appendChild(setupSnippetsCard(SectionCardC, catalog.endpoint.url));
    center.appendChild(inventoryCard("Tools", catalog.tools, "tool"));
    center.appendChild(
      inventoryCard("Resource templates", catalog.resourceTemplates, "template")
    );
  }
  center.appendChild(boundaryCard(catalog));
  right.appendChild(summaryCard(catalog));
}

/**
 * Builds the gallery route header.
 * @param catalog - Public MCP catalog response.
 * @returns Header card.
 */
function headerCard(catalog: McpCatalogResponse): HTMLElement {
  const serverInfo = serverInfoText(catalog.initialize);
  return SectionCardC({
    title: "AdvisorBook MCP gallery",
    attrs: { class: "mcp-gallery-header" },
    body: el(
      "div",
      { class: "mcp-gallery-header-body" },
      galleryLede(),
      galleryStatusRow(catalog),
      el(
        "div",
        { class: "mcp-gallery-stat-grid" },
        stat("Endpoint", catalog.endpoint.url),
        stat("Transport", catalog.endpoint.transport),
        stat("Server", serverInfo),
        stat("Generated", fmtDate(catalog.generatedAt))
      )
    ),
  });
}

/**
 * Builds the gallery lede text node.
 * @returns MCP gallery lede paragraph.
 */
function galleryLede(): HTMLElement {
  return el(
    "p",
    { class: "mcp-gallery-lede" },
    "Public inventory for the read-only AdvisorBook MCP endpoint."
  );
}

/**
 * Builds endpoint and boundary status tags for the gallery header.
 * @param catalog - Public MCP catalog response.
 * @returns Status row element.
 */
function galleryStatusRow(catalog: McpCatalogResponse): HTMLElement {
  return el(
    "div",
    { class: "mcp-gallery-status-row" },
    statusTag(catalog.status),
    TagC({
      kind: catalog.endpoint.authRequired ? "warn" : "ok",
      children: catalog.endpoint.authRequired
        ? "Auth required"
        : "No sign-in required",
    }),
    TagC({
      kind: catalog.readOnlyBoundary.status === "read-only" ? "ok" : "warn",
      children: catalog.readOnlyBoundary.status,
    }),
    freshnessTag(catalog.generatedAt)
  );
}

/**
 * Builds a catalog inventory card for tools or resource templates.
 * @param title - Card title.
 * @param entries - Raw catalog entries.
 * @param kind - Entry kind used for stable test selectors.
 * @returns Inventory card.
 */
function inventoryCard(
  title: string,
  entries: readonly unknown[],
  kind: "tool" | "template"
): HTMLElement {
  return SectionCardC({
    title,
    attrs: { class: "mcp-gallery-inventory" },
    body: el(
      "div",
      { class: "mcp-gallery-inventory-grid" },
      ...entries.map((entry, index) => entryCard(entry, kind, index))
    ),
  });
}

/**
 * Builds one tool/template inventory tile.
 * @param entry - Raw catalog entry.
 * @param kind - Entry kind.
 * @param index - Stable fallback index.
 * @returns Inventory tile.
 */
function entryCard(
  entry: unknown,
  kind: "tool" | "template",
  index: number
): HTMLElement {
  const item = catalogEntry(entry);
  const name =
    item.title || item.name || item.uriTemplate || `${kind} ${index + 1}`;
  const code = item.name || item.uriTemplate || name;
  return el(
    "article",
    {
      class: "mcp-gallery-entry",
      "data-mcp-gallery-entry": kind,
    },
    el("h3", {}, name),
    el("code", {}, code),
    item.description
      ? el("p", { class: "mcp-gallery-entry-description" }, item.description)
      : null
  );
}

/**
 * Builds endpoint metadata rail content.
 * @param catalog - Public MCP catalog response.
 * @returns Endpoint card.
 */
function endpointCard(catalog: McpCatalogResponse): HTMLElement {
  return SectionCardC({
    title: "Endpoint",
    attrs: { class: "mcp-gallery-endpoint" },
    body: el(
      "div",
      { class: RAIL_STACK_CLASS },
      el("code", { class: "mcp-gallery-endpoint-code" }, catalog.endpoint.url),
      el(
        "p",
        { class: "mcp-gallery-muted" },
        "Use streamable HTTP JSON-RPC POST requests against this same-origin route."
      )
    ),
  });
}

/**
 * Builds read-only/private-data boundary rail content.
 * @param catalog - Public MCP catalog response.
 * @returns Boundary card.
 */
function boundaryCard(catalog: McpCatalogResponse): HTMLElement {
  return SectionCardC({
    title: "Read-only boundary",
    attrs: { class: "mcp-gallery-boundary" },
    body: el(
      "div",
      { class: RAIL_STACK_CLASS },
      el(
        "p",
        { class: "mcp-gallery-muted" },
        "The public catalog excludes private watchlists, ratings, raw tables, credentials, write actions, and analyst-only data."
      ),
      el(
        "div",
        { class: "mcp-gallery-status-row" },
        TagC({ kind: "ok", children: "Public data only" }),
        TagC({
          kind: catalog.readOnlyBoundary.filteredCapabilities ? "warn" : "ok",
          children: `${catalog.readOnlyBoundary.filteredCapabilities} filtered`,
        })
      )
    ),
  });
}

/**
 * Builds a compact right-rail summary for wide viewports.
 * @param catalog - Public MCP catalog response.
 * @returns Summary card.
 */
function summaryCard(catalog: McpCatalogResponse): HTMLElement {
  return SectionCardC({
    title: "Inventory",
    attrs: { class: "mcp-gallery-summary" },
    body: el(
      "div",
      { class: RAIL_STACK_CLASS },
      stat("Tools", String(catalog.tools.length)),
      stat("Templates", String(catalog.resourceTemplates.length)),
      stat("Boundary", catalog.readOnlyBoundary.status)
    ),
  });
}

/**
 * Builds an explicit unavailable-state card.
 * @param catalog - Unavailable catalog response.
 * @returns Unavailable state card.
 */
function unavailableCard(catalog: McpCatalogResponse): HTMLElement {
  return EmptyCardC({
    title: "MCP catalog unavailable",
    body:
      catalog.unavailableReason ||
      "The endpoint probe did not return live inventory. The page is showing the fail-closed public boundary only.",
  });
}

/**
 * Renders a route load failure.
 * @param error - Load error.
 * @param center - Main route column.
 */
function renderLoadError(error: unknown, center: HTMLElement): void {
  clear(center);
  center.appendChild(
    EmptyCardC({
      title: "Could not load MCP gallery",
      body: error instanceof Error ? error.message : String(error),
    })
  );
}

/**
 * Builds one compact header metric.
 * @param label - Metric label.
 * @param value - Metric value.
 * @returns Metric node.
 */
function stat(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "mcp-gallery-stat" },
    el("span", {}, label),
    el("strong", {}, value)
  );
}

/**
 * Builds a status tag.
 * @param status - Catalog status.
 * @returns Tag node.
 */
function statusTag(status: McpCatalogResponse["status"]): HTMLElement {
  return TagC({
    kind: status === "ready" ? "ok" : "warn",
    children: status === "ready" ? "Catalog ready" : "Catalog unavailable",
  });
}

/**
 * Builds a freshness tag from the catalog generation timestamp.
 * @param generatedAt - Catalog timestamp.
 * @returns Freshness tag node.
 */
function freshnessTag(generatedAt: string): HTMLElement {
  const generatedTime = new Date(generatedAt).getTime();
  const stale =
    Number.isFinite(generatedTime) && Date.now() - generatedTime > 15 * 60_000;
  return TagC({
    kind: stale ? "warn" : "ok",
    children: stale ? "Catalog stale" : "Catalog fresh",
  });
}

/**
 * Extracts server info from the initialize payload.
 * @param initialize - Raw initialize result.
 * @returns Human-readable server info.
 */
function serverInfoText(initialize: unknown): string {
  if (!initialize || typeof initialize !== "object") return "Unavailable";
  const serverInfo = Reflect.get(initialize, "serverInfo");
  if (!serverInfo || typeof serverInfo !== "object") return "Unavailable";
  const title = stringValue(Reflect.get(serverInfo, "title"));
  const name = stringValue(Reflect.get(serverInfo, "name"));
  const version = stringValue(Reflect.get(serverInfo, "version"));
  return [title || name || "AdvisorBook", version].filter(Boolean).join(" ");
}

/**
 * Narrows a raw catalog entry for display.
 * @param entry - Raw catalog entry.
 * @returns Display fields.
 */
function catalogEntry(entry: unknown): CatalogEntry {
  if (!entry || typeof entry !== "object") return {};
  return {
    name: stringValue(Reflect.get(entry, "name")),
    title: stringValue(Reflect.get(entry, "title")),
    description: stringValue(Reflect.get(entry, "description")),
    uriTemplate: stringValue(Reflect.get(entry, "uriTemplate")),
  };
}

/**
 * Reads a non-empty string value.
 * @param value - Unknown value.
 * @returns String value or undefined.
 */
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
