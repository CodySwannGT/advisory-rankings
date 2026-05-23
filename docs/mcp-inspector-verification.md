# MCP Inspector verification

Use this procedure to verify the AdvisorBook MCP endpoint with MCP
Inspector. It covers local development and the deployed dev endpoint.

## Endpoints

| Target | Endpoint |
|---|---|
| Local dev server | `http://127.0.0.1:9926/mcp` |
| Fabric dev | `https://advisory-rankings-de.cody-swann-org.harperfabric.com/mcp` |

The endpoint is public, unauthenticated, Streamable HTTP, and read-only.
Do not configure headers, tokens, variables, or secrets for Inspector.

## Local setup

Start the local static/custom-resource server:

```bash
bun run dev:server
```

Then use `http://127.0.0.1:9926/mcp` as the Inspector server URL. Tool
calls and resource reads use the local Harper operations socket behind
`bun run dev:server`; run `bun run seed` first if the local database is
empty.

## Inspector UI path

Start Inspector:

```bash
npx -y @modelcontextprotocol/inspector
```

In the Inspector UI:

1. Set transport to `Streamable HTTP`.
2. Set the server URL to the local or Fabric `/mcp` endpoint.
3. Connect and confirm initialization succeeds with `AdvisorBook` server
   info.
4. Open the Tools tab and confirm exactly these tools are listed:
   `search_advisorbook`, `get_feed`, `get_advisor_profile`,
   `get_firm_profile`, `get_team_profile`, and `get_article`.
5. Run `search_advisorbook` with `query=Taylor` and `limit=3`; confirm the
   response includes advisor/team search results and `advisorbook://...`
   resource links.
6. Run `get_feed` with `limit=1`; copy one article, advisor, firm, or team
   resource URI from the response.
7. Open the Resources tab and confirm exactly these templates are listed:
   `advisorbook://feed`, `advisorbook://advisor/{id}`,
   `advisorbook://firm/{id}`, `advisorbook://team/{id}`, and
   `advisorbook://article/{id}`.
8. Read `advisorbook://feed`, then read one profile/article resource copied
   from the tool response.

## Inspector CLI probes

Set the endpoint once:

```bash
export MCP_ENDPOINT=https://advisory-rankings-de.cody-swann-org.harperfabric.com/mcp
# or: export MCP_ENDPOINT=http://127.0.0.1:9926/mcp
```

List tools:

```bash
npx -y @modelcontextprotocol/inspector --cli "$MCP_ENDPOINT" \
  --transport http \
  --method tools/list
```

List resource templates:

```bash
npx -y @modelcontextprotocol/inspector --cli "$MCP_ENDPOINT" \
  --transport http \
  --method resources/templates/list
```

Call the search tool:

```bash
npx -y @modelcontextprotocol/inspector --cli "$MCP_ENDPOINT" \
  --transport http \
  --method tools/call \
  --tool-name search_advisorbook \
  --tool-arg query=Taylor \
  --tool-arg limit=3
```

The CLI mode is useful for listing capabilities and calling tools. Use the
Inspector UI Resources tab for resource reads because it provides the
resource-template browser and JSON content viewer.

## Negative capability check

The MCP server must not expose write, admin, raw table, SQL, credential, or
secret-oriented capabilities.

In the Inspector UI, verify:

- Tools contains only the six curated read-only tools listed above.
- Resources contains only `advisorbook://...` templates.
- There are no tools, resources, prompts, or roots for raw Harper tables,
  mutation, SQL, admin operations, tokens, credentials, or secrets.

For a repeatable CLI check, pipe `tools/list` through `jq`:

```bash
npx -y @modelcontextprotocol/inspector --cli "$MCP_ENDPOINT" \
  --transport http \
  --method tools/list \
  | jq -e '
      ([.tools[].name] == [
        "search_advisorbook",
        "get_feed",
        "get_advisor_profile",
        "get_firm_profile",
        "get_team_profile",
        "get_article"
      ])
      and
      ([.tools[].name | select(test("write|create|update|delete|admin|raw|table|sql|secret|credential|token"; "i"))] | length == 0)
    '
```

Run the same check for resource templates:

```bash
npx -y @modelcontextprotocol/inspector --cli "$MCP_ENDPOINT" \
  --transport http \
  --method resources/templates/list \
  | jq -e '
      ([.resourceTemplates[].uriTemplate] == [
        "advisorbook://feed",
        "advisorbook://advisor/{id}",
        "advisorbook://firm/{id}",
        "advisorbook://team/{id}",
        "advisorbook://article/{id}"
      ])
      and
      ([.resourceTemplates[].uriTemplate | test("^advisorbook://")] | all)
    '
```
