#!/usr/bin/env node
import { basicAuth, restGet } from "../lib/rest.js";
import { loadCreds } from "./_auth.js";

/**
 * Removes trailing slashes without relying on a backtracking regex.
 * @param value - URL-like value that may include one or more final slashes.
 * @returns The same value without trailing slash characters.
 */
function stripTrailingSlashes(value: string): string {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
}

/**
 * Returns strings in locale-aware alphabetical order.
 * @param values - Values to order for stable reporting.
 * @returns A sorted copy of the supplied strings.
 */
function sortStrings(values: Iterable<string>): readonly string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

const creds = loadCreds();
const clusterBase = stripTrailingSlashes(creds.clusterUrl ?? "");
const base = stripTrailingSlashes(
  process.env.HDB_TARGET_URL ?? `${clusterBase}:9925/`
);
const username = process.env.HDB_ADMIN_USERNAME ?? creds.username;
const password = process.env.HDB_ADMIN_PASSWORD ?? creds.password;

if (!base)
  throw new Error(
    "HDB_TARGET_URL is required (or HARPER_CLUSTER_URL via loadCreds)"
  );
if (!username)
  throw new Error(
    "HDB_ADMIN_USERNAME is required (or HARPER_ADMIN_USERNAME via loadCreds)"
  );
if (!password)
  throw new Error(
    "HDB_ADMIN_PASSWORD is required (or HARPER_ADMIN_PASSWORD via loadCreds)"
  );

const auth = basicAuth(username, password);

const tables = [
  "Firm",
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
  "AdvisorResearchCheck",
  "User",
  "UserRating",
  "UserList",
  "UserListEntry",
];

console.error(`[verify_via_rest] target: REST ${base}`);
console.log("\n══ Row counts per table ═════════════════════════════════");
const counts = await Promise.all(
  sortStrings(tables).map(async table => {
    const rows = await restGet(base, table, auth);
    if (rows.length)
      console.log(`  ${table.padEnd(35)} ${String(rows.length).padStart(4)}`);
    return rows.length;
  })
);
const total = counts.reduce((sum, count) => sum + count, 0);
console.log(`  ${"TOTAL".padEnd(35)} ${String(total).padStart(4)}`);
console.log("\nverify_via_rest complete");
