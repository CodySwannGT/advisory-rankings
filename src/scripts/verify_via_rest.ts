#!/usr/bin/env node
// @ts-nocheck
import { basicAuth, requiredEnv, restGet } from "../lib/rest.js";

const base = requiredEnv("HDB_TARGET_URL");
const auth = basicAuth(requiredEnv("HDB_ADMIN_USERNAME"), requiredEnv("HDB_ADMIN_PASSWORD"));

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
