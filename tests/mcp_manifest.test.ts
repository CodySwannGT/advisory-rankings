import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(await readFile("server.json", "utf8"));

describe("MCP server manifest", () => {
  it("declares the deployed streamable HTTP endpoint", () => {
    expect(manifest).toMatchObject({
      $schema:
        "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
      name: "io.github.codyswanngt/advisory-rankings",
      title: "AdvisorBook",
      remotes: [
        {
          type: "streamable-http",
          url: "https://advisory-rankings-de.cody-swann-org.harperfabric.com/mcp",
        },
      ],
    });
  });

  it("does not require auth headers, variables, or embedded credentials", () => {
    expect(manifest.remotes).toHaveLength(1);
    expect(manifest.remotes[0]).not.toHaveProperty("headers");
    expect(manifest.remotes[0]).not.toHaveProperty("variables");
    expect(JSON.stringify(manifest).toLowerCase()).not.toMatch(
      /token|secret|password|api[-_ ]?key|authorization/u
    );
  });
});
