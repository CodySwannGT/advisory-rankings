#!/usr/bin/env node
import {
  loadCommittedAppUserRole,
  normalizeLiveAppUserRole,
  roleDrift,
} from "../lib/harper-role-map.js";
import { loadCreds, StudioSession } from "./_auth.js";

const expected = loadCommittedAppUserRole();
const creds = loadCreds();
const studio = await new StudioSession(creds).login();
const response = await studio.clusterOp(creds.clusterId, "list_roles");
if (response.status !== 200) {
  throw new Error(
    `list_roles failed: ${response.status} ${JSON.stringify(response.body).slice(0, 200)}`
  );
}
const live = normalizeLiveAppUserRole(response.body);
const drift = roleDrift(expected, live);

console.error(
  `[check_roles] target: ${creds.studioUrl}/Cluster/${creds.clusterId}/operation/`
);
if (drift.length > 0) {
  console.error("app_user role drift detected:");
  for (const line of drift) console.error(`  - ${line}`);
  process.exitCode = 1;
} else {
  console.log(
    `app_user role drift check passed (${Object.keys(expected.data.tables).length} tables)`
  );
}
