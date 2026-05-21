#!/usr/bin/env node
// @ts-nocheck
import { basicAuth, restGet } from "../lib/rest.js";
import { loadCreds } from "./_auth.js";

const creds = loadCreds();
const clusterBase = (creds.clusterUrl ?? "").replace(/\/+$/, "");
const base = (process.env.HDB_TARGET_URL ?? `${clusterBase}:9925/`).replace(/\/+$/, "");
const username = process.env.HDB_ADMIN_USERNAME ?? creds.username;
const password = process.env.HDB_ADMIN_PASSWORD ?? creds.password;

if (!base) throw new Error("HDB_TARGET_URL is required (or HARPER_CLUSTER_URL via loadCreds)");
if (!username) throw new Error("HDB_ADMIN_USERNAME is required (or HARPER_ADMIN_USERNAME via loadCreds)");
if (!password) throw new Error("HDB_ADMIN_PASSWORD is required (or HARPER_ADMIN_PASSWORD via loadCreds)");

const auth = basicAuth(username, password);

const tables = [
  "Firm", "FirmSuccession", "Branch", "BranchAssignment", "Advisor",
  "Education", "Designation", "License", "EmploymentHistory",
  "RegistrationApplication", "Team", "TeamMembership",
  "TeamMetricSnapshot", "AdvisorMetricSnapshot", "TransitionEvent",
  "RecruitingDealQuote", "Disclosure", "DisclosureCluster", "Sanction",
  "OutsideBusinessActivity", "EmployerConcentration", "Ranking",
  "RankingEntry", "Article", "ArticleAdvisorMention",
  "ArticleFirmMention", "ArticleTeamMention",
  "ArticleTransitionEventMention", "ArticleDisclosureMention",
  "FieldAssertion", "User", "UserRating", "UserList", "UserListEntry",
];

console.error(`[verify_via_rest] target: REST ${base}`);
console.log("\n══ Row counts per table ═════════════════════════════════");
let total = 0;
const data: Record<string, Record<string, unknown>[]> = {};
for (const table of tables.sort()) {
  const rows = await restGet(base, table, auth);
  data[table] = rows as Record<string, unknown>[];
  if (rows.length) console.log(`  ${table.padEnd(35)} ${String(rows.length).padStart(4)}`);
  total += rows.length;
}
console.log(`  ${"TOTAL".padEnd(35)} ${String(total).padStart(4)}`);
console.log("\nverify_via_rest complete");
