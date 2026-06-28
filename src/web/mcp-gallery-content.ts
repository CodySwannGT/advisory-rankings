import { el } from "./design-system/index.js";

/** Callable adapter for untyped design-system components. */
type DesignSystemComponent = (...args: ReadonlyArray<unknown>) => HTMLElement;

/** Product-language MCP workflow template displayed in the gallery. */
interface QueryTemplate {
  readonly title: string;
  readonly audience: string;
  readonly backing: string;
  readonly example: string;
  readonly fields: string;
  readonly route: string;
  readonly provenance: string;
}

/** Copyable setup or sample snippet displayed in the gallery. */
interface SetupSnippet {
  readonly title: string;
  readonly body: string;
}

const DEPLOYED_MCP_ENDPOINT =
  "https://advisory-rankings-de.cody-swann-org.harperfabric.com/mcp";
const QUERY_TEMPLATES: readonly QueryTemplate[] = [
  {
    title: "Research desk source trail",
    audience: "Research desk",
    backing: "Tool: get_article; resource: advisorbook://article/{id}",
    example: '{"id":"article-slug-or-id"}',
    fields:
      "article, provenance, eventCards, advisors, firms, teams, resource, url",
    route:
      "Open the returned url to inspect the public article page and evidence map.",
    provenance:
      "Use source URLs, loaded dates, and extracted-fact provenance before quoting a fact.",
  },
  {
    title: "Recruiter firm lookup",
    audience: "Recruiter",
    backing: "Tool: search_advisorbook; resource: advisorbook://firm/{id}",
    example: '{"query":"Morgan Stanley","limit":3}',
    fields: "query, counts, items.kind, items.name, items.resource, items.url",
    route:
      "Follow firm urls to compare public rosters, transitions, branches, and articles.",
    provenance:
      "Treat missing AUM, T12, branch, or transition fields as visible data gaps, not zeros.",
  },
  {
    title: "Investor due diligence profile",
    audience: "Investor due diligence",
    backing: "Tool: get_advisor_profile; resource: advisorbook://advisor/{id}",
    example: '{"id":"advisor-slug-or-id"}',
    fields:
      "advisor, currentFirm, career, disclosures, evidenceFreshness, confidenceSummary, articles, url",
    route:
      "Open the advisor url to inspect career, disclosure, sanctions, and BrokerCheck context.",
    provenance:
      "Confirm BrokerCheck freshness and article links before treating the profile as current.",
  },
  {
    title: "Investor evaluator coverage check",
    audience: "Investor evaluator",
    backing: "Tool: get_feed; resource: advisorbook://feed",
    example: '{"limit":5}',
    fields:
      "generatedAt, count, items.article, items.eventCards, resource, url",
    route:
      "Use feed and coverage pages together to inspect freshness and source depth.",
    provenance:
      "Use generatedAt and source-backed event cards as freshness context for demos.",
  },
];
const SETUP_SNIPPETS: readonly SetupSnippet[] = [
  {
    title: "Inspector setup",
    body: `Transport: Streamable HTTP
Server URL: ${DEPLOYED_MCP_ENDPOINT}
Headers: none
Credentials: none`,
  },
  {
    title: "Generic Streamable HTTP call",
    body: `fetch("${DEPLOYED_MCP_ENDPOINT}", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "advisorbook-search",
    method: "tools/call",
    params: {
      name: "search_advisorbook",
      arguments: { query: "Morgan Stanley", limit: 3 }
    }
  })
})`,
  },
  {
    title: "Bounded sample query",
    body: `Tool: search_advisorbook
Arguments: {"query":"Morgan Stanley","limit":3}
Expected freshness: read counts and returned urls with the catalog generated timestamp before citing results.`,
  },
];

/**
 * Builds workflow templates that explain how public MCP entries map to jobs.
 * @param SectionCardC - Design-system section card adapter.
 * @param TagC - Design-system tag adapter.
 * @returns Query-template card.
 */
export function queryTemplatesCard(
  SectionCardC: DesignSystemComponent,
  TagC: DesignSystemComponent
): HTMLElement {
  return SectionCardC({
    title: "Query templates",
    attrs: { class: "mcp-gallery-templates" },
    body: el(
      "div",
      { class: "mcp-gallery-template-grid" },
      ...QUERY_TEMPLATES.map(template => queryTemplateCard(template, TagC))
    ),
  });
}

/**
 * Builds copyable setup and sample snippets.
 * @param SectionCardC - Design-system section card adapter.
 * @returns Setup snippets card.
 */
export function setupSnippetsCard(
  SectionCardC: DesignSystemComponent
): HTMLElement {
  return SectionCardC({
    title: "Setup snippets",
    attrs: { class: "mcp-gallery-snippets" },
    body: el(
      "div",
      { class: "mcp-gallery-snippet-grid" },
      ...SETUP_SNIPPETS.map(snippetCard)
    ),
  });
}

/**
 * Builds one workflow template tile.
 * @param template - Product-language query template.
 * @param TagC - Design-system tag adapter.
 * @returns Template tile.
 */
function queryTemplateCard(
  template: QueryTemplate,
  TagC: DesignSystemComponent
): HTMLElement {
  return el(
    "article",
    {
      class: "mcp-gallery-template",
      "data-mcp-gallery-template": template.audience,
    },
    el(
      "div",
      { class: "mcp-gallery-template-heading" },
      el("h3", {}, template.title),
      TagC({ kind: "neutral", children: template.audience })
    ),
    detailRow("Backing", template.backing),
    detailRow("Example input", template.example, true),
    detailRow("Expected fields", template.fields),
    detailRow("Web route behavior", template.route),
    detailRow("Source expectations", template.provenance)
  );
}

/**
 * Builds one copyable setup snippet.
 * @param snippet - Setup snippet.
 * @returns Snippet tile.
 */
function snippetCard(snippet: SetupSnippet): HTMLElement {
  const button = el(
    "button",
    {
      type: "button",
      class: "mcp-gallery-copy-button",
      "aria-label": `Copy ${snippet.title}`,
    },
    "Copy"
  );
  button.addEventListener("click", () => copyText(snippet.body));
  return el(
    "article",
    { class: "mcp-gallery-snippet", "data-mcp-gallery-snippet": snippet.title },
    el(
      "div",
      { class: "mcp-gallery-snippet-heading" },
      el("h3", {}, snippet.title),
      button
    ),
    el("pre", { class: "mcp-gallery-code-block" }, el("code", {}, snippet.body))
  );
}

/**
 * Builds one labeled detail row.
 * @param label - Detail label.
 * @param value - Detail value.
 * @param code - Whether to render the value as inline code.
 * @returns Detail row.
 */
function detailRow(label: string, value: string, code = false): HTMLElement {
  return el(
    "div",
    { class: "mcp-gallery-detail-row" },
    el("span", {}, label),
    code ? el("code", {}, value) : el("p", {}, value)
  );
}

/**
 * Copies text when the browser exposes clipboard access.
 * @param text - Text to copy.
 */
function copyText(text: string): void {
  if (!navigator.clipboard) return;
  void navigator.clipboard.writeText(text);
}
