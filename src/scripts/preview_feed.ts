#!/usr/bin/env node
// @ts-nocheck
/**
 * Offline smoke test for harper-app/resources.js.
 *
 * Why this exists: this sandbox kernel can't bind Harper's REST TCP
 * port (the same SO_REUSEPORT issue documented in
 * docs/fabric-runbook.md §5), so curl http://127.0.0.1:9926/Feed
 * doesn't work locally. Once deployed to Fabric, port 443 fronts the
 * REST endpoints just fine; locally we still want to verify that the
 * Feed/profile resources produce sane output.
 *
 * What it does: pulls every @export table out of Harper via the
 * operations-API SQL endpoint (which IS reachable, via the
 * `~/.harperdb/operations-server` Unix socket), stubs out a
 * `globalThis.tables` shim that resembles what Harper would inject,
 * imports resources.js, and prints the JSON each resource returns.
 *
 * Run:
 *   bun run preview                         # /Feed
 *   bun run preview -- firm <id>
 *   bun run preview -- advisor <id>
 *   bun run preview -- team <id>
 *   bun run preview -- article <id>
 *
 * Reads HDB_ADMIN_USERNAME / HDB_ADMIN_PASSWORD from the env, falling
 * back to admin/admin-local (the bootstrap.sh defaults).
 * @returns The computed value.
 */

import { request } from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SOCKET =
  process.env.HDB_OPS_SOCKET ||
  `${process.env.HOME}/.harperdb/operations-server`;
const USER = process.env.HDB_ADMIN_USERNAME || "admin";
const PASS = process.env.HDB_ADMIN_PASSWORD || "admin-local";
const AUTH = `Basic ${Buffer.from(`${USER}:${PASS}`).toString("base64")}`;

const TABLES = [
  "Firm",
  "FirmAlias",
  "FirmMergeAudit",
  "FirmSuccession",
  "Branch",
  "BranchAssignment",
  "Advisor",
  "Education",
  "Designation",
  "License",
  "EmploymentHistory",
  "RegistrationApplication",
  "Team",
  "TeamMembership",
  "TeamMetricSnapshot",
  "AdvisorMetricSnapshot",
  "TransitionEvent",
  "RecruitingDealQuote",
  "Disclosure",
  "DisclosureCluster",
  "Sanction",
  "OutsideBusinessActivity",
  "EmployerConcentration",
  "Ranking",
  "RankingEntry",
  "Article",
  "ArticleAdvisorMention",
  "ArticleFirmMention",
  "ArticleTeamMention",
  "ArticleTransitionEventMention",
  "ArticleDisclosureMention",
  "FieldAssertion",
];

/**
 * Handles ops call for this workflow.
 * @param body - body used by this operation.
 * @returns The computed value.
 */
function opsCall(body) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: SOCKET,
        method: "POST",
        path: "/",
        headers: { "Content-Type": "application/json", Authorization: AUTH },
      },
      async res => {
        res.setEncoding("utf8");
        const buf = await new Response(res).text();
        try {
          resolve(JSON.parse(buf));
        } catch (_error) {
          reject(new Error(`bad json: ${buf.slice(0, 200)}`));
        }
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Loads table from the configured source.
 * @param name - Display name or option name.
 * @returns Rows from the table or an empty array when absent.
 */
async function loadTable(name) {
  const res = await opsCall({
    operation: "sql",
    sql: `SELECT * FROM data.${name}`,
  });
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (res?.error) {
    // Empty / unknown table → just skip.
    return [];
  }
  return [];
}

/**
 * Runs the resource preview command.
 */
async function main() {
  const cmd = process.argv[2] || "feed";
  const id = process.argv[3];

  // 1. Pull everything once.
  const data = Object.fromEntries(
    await Promise.all(TABLES.map(async t => [t, await loadTable(t)]))
  );

  // 2. Build a `tables.X.search({})` shim that returns an AsyncIterable
  //    over the rows we just loaded.
  const tables = Object.fromEntries(
    TABLES.map(t => [
      t,
      {
        search: _query =>
          (async function* () {
            for (const r of data[t]) yield r;
          })(),
      },
    ])
  );

  // 3. Stub Resource so resources.js can `extends Resource`.
  /**
   * Handles resource for this workflow.
   */
  class Resource {
    /**
     * Handles constructor for this workflow.
     * @returns The computed value.
     */
    constructor() {}
  }

  globalThis.tables = tables;
  globalThis.Resource = Resource;

  const mod = await import(
    pathToFileURL(resolve("harper-app/resources.js")).href
  );

  const result = await previewResult(mod, cmd, id);

  console.log(JSON.stringify(result, null, 2));
}

/**
 * Executes the requested generated resource.
 * @param mod - Imported resources module.
 * @param cmd - Preview command name.
 * @param id - Optional resource ID.
 * @returns Resource response payload.
 */
async function previewResult(mod, cmd, id) {
  if (cmd === "feed") return new mod.Feed().get();
  if (cmd === "firm") return new mod.FirmProfile().get(id);
  if (cmd === "advisor") return new mod.AdvisorProfile().get(id);
  if (cmd === "team") return new mod.TeamProfile().get(id);
  if (cmd === "article") return new mod.ArticleView().get(id);
  console.error(`unknown command: ${cmd}`);
  process.exitCode = 2;
  return null;
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
