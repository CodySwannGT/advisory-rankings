#!/usr/bin/env node
// @ts-nocheck
import { appendFile, mkdir } from "node:fs/promises";
import { BrokerCheckBlocked, BrokerCheckClient } from "../lib/brokercheck.js";
import { HarperREST, Resolver } from "../lib/brokercheck-load.js";
import {
  crawlFirmRoster,
  fetchOneFirm,
  loadState,
  saveState,
} from "./fetch_brokercheck.js";

const LOG_FILE = "research/brokercheck-crawl.log";
const DEFAULT_MAX_RUNTIME_SECONDS = 4 * 3600;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

async function log(...parts: any[]): Promise<void> {
  const line = `[${new Date().toISOString()}] ${parts.map(String).join(" ")}\n`;
  process.stderr.write(line);
  await mkdir("research", { recursive: true });
  await appendFile(LOG_FILE, line);
}

function normalizeFirmName(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .replace(/\b(l\.?l\.?c|inc|l\.?p|corp(?:oration)?|incorporated)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firmNameMatch(a: string, b: string): boolean {
  return Boolean(a && b && normalizeFirmName(a) === normalizeFirmName(b));
}

async function lookupFirmCrds(rest: HarperREST, client: BrokerCheckClient): Promise<Record<string, number>> {
  await log("phase 1: firm CRD lookup");
  const firms = (await rest.get("/Firm/")) ?? [];
  const targets = firms.filter((firm: any) => !firm.finraCrd);
  const summary = { matched: 0, ambiguous: 0, no_match: 0, errors: 0 };
  await log(`  ${targets.length}/${firms.length} firms missing finraCrd`);

  for (const firm of targets) {
    const name = (firm.name ?? "").trim();
    if (!name) continue;
    try {
      const raw = await client.searchFirm(name, 0, 10);
      const hits = raw?.hits?.hits ?? [];
      const candidates = hits
        .map((hit: any) => hit?._source ?? {})
        .filter((source: any) => {
          const names = [
            source.firm_name,
            source.ia_firm_name,
            ...(source.firm_other_names ?? []),
          ];
          return names.some((candidate: string) => firmNameMatch(name, candidate));
        });
      if (candidates.length !== 1) {
        summary[candidates.length ? "ambiguous" : "no_match"]++;
        await log(`  ${name}: ${candidates.length ? "ambiguous" : "no exact match"} (${hits.length} hits)`);
        continue;
      }
      const crd = String(candidates[0].firm_source_id ?? candidates[0].firmId ?? "");
      if (!crd) {
        summary.no_match++;
        continue;
      }
      if (await rest.put("Firm", { ...firm, finraCrd: crd })) {
        summary.matched++;
        await log(`  ${name}: matched firmId ${crd}`);
      } else {
        summary.errors++;
      }
    } catch (error) {
      summary.errors++;
      await log(`  ${name}: lookup failed: ${error}`);
    }
  }
  await log(`phase 1 summary: ${JSON.stringify(summary)}`);
  return summary;
}

async function fetchFirmSnapshots(
  rest: HarperREST,
  client: BrokerCheckClient,
  resolver: Resolver,
  state: any,
  force: boolean
): Promise<Record<string, number>> {
  await log("phase 2: firm snapshots");
  const firms = ((await rest.get("/Firm/")) ?? []).filter((firm: any) => firm.finraCrd);
  const summary = { fetched: 0, skipped: 0, errors: 0 };
  resolver.firmListing = null;
  for (const firm of firms) {
    try {
      const counts = await fetchOneFirm(client, rest, resolver, state, String(firm.finraCrd), { force, log });
      if (counts) summary.fetched++;
      else summary.skipped++;
      await saveState(state);
    } catch (error) {
      summary.errors++;
      await log(`  firm ${firm.finraCrd} failed: ${error}`);
    }
  }
  await log(`phase 2 summary: ${JSON.stringify(summary)}`);
  return summary;
}

async function walkFirmRosters(
  rest: HarperREST,
  client: BrokerCheckClient,
  resolver: Resolver,
  state: any,
  opts: { maxPerFirm: number; force: boolean; deadline: number; onlyFirmId?: string }
): Promise<Record<string, number>> {
  await log("phase 3: roster walks");
  let firms = ((await rest.get("/Firm/")) ?? []).filter((firm: any) => firm.finraCrd);
  if (opts.onlyFirmId) firms = firms.filter((firm: any) => String(firm.finraCrd) === opts.onlyFirmId);

  const snapshots = (await rest.get("/BrokerCheckSnapshot/")) ?? [];
  const byCrd = new Map(
    snapshots
      .filter((snap: any) => snap.subjectKind === "firm")
      .map((snap: any) => [String(snap.subjectCrd), snap])
  );
  firms.sort((a: any, b: any) => {
    const left = byCrd.get(String(a.finraCrd))?.disclosureCount ?? 0;
    const right = byCrd.get(String(b.finraCrd))?.disclosureCount ?? 0;
    return left - right || String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });

  const total = { fetched: 0, skipped: 0, errors: 0, blocked: 0 };
  await log(`  walking ${firms.length} firms, cap ${opts.maxPerFirm || "unlimited"} advisors/firm`);
  for (const firm of firms) {
    if (Date.now() > opts.deadline) {
      await log(`  runtime budget hit before firm ${firm.finraCrd}; stopping cleanly`);
      break;
    }
    try {
      await log(`  firm ${firm.finraCrd} (${firm.name ?? ""})`);
      const summary = await crawlFirmRoster(client, rest, resolver, state, String(firm.finraCrd), {
        max: opts.maxPerFirm,
        force: opts.force,
        log,
      });
      for (const key of ["fetched", "skipped", "errors"]) total[key] += summary[key] ?? 0;
      await saveState(state);
      await log(`  firm ${firm.finraCrd} done: ${JSON.stringify(summary)}`);
    } catch (error) {
      if (error instanceof BrokerCheckBlocked) {
        total.blocked++;
        await saveState(state);
        await log(`  BrokerCheck blocked the crawl: ${error.message}`);
        return total;
      }
      total.errors++;
      await log(`  firm ${firm.finraCrd} failed: ${error}`);
    }
  }
  await log(`phase 3 summary: ${JSON.stringify(total)}`);
  return total;
}

async function main(): Promise<void> {
  const start = Date.now();
  const maxRuntimeSeconds = Number(arg("--max-runtime-seconds") ?? DEFAULT_MAX_RUNTIME_SECONDS);
  const maxPerFirm = Number(arg("--max-per-firm") ?? "0");
  const rateSeconds = arg("--rate-seconds") ? Number(arg("--rate-seconds")) : undefined;
  const force = has("--force");
  const rest = new HarperREST({ verbose: false });
  const resolver = new Resolver(rest);
  const client = new BrokerCheckClient({ rateSeconds, verbose: false });
  const state = await loadState();
  const summaries: Record<string, unknown> = {};

  await log(`==== brokercheck_crawl_all START max-per-firm=${maxPerFirm || "unlimited"} max-runtime=${maxRuntimeSeconds}s force=${force} ====`);
  if (!has("--skip-firm-lookup")) summaries.firm_lookup = await lookupFirmCrds(rest, client);
  if (!has("--skip-firm-snapshots")) summaries.firm_snapshots = await fetchFirmSnapshots(rest, client, resolver, state, force);
  if (!has("--skip-rosters")) {
    summaries.rosters = await walkFirmRosters(rest, client, resolver, state, {
      maxPerFirm,
      force,
      onlyFirmId: arg("--only-firm-id"),
      deadline: start + maxRuntimeSeconds * 1000,
    });
  }

  await saveState(state);
  const elapsed = Math.round((Date.now() - start) / 1000);
  await log(`==== DONE in ${elapsed}s (${client.requestCount} HTTP, ${rest.readCount} REST reads, ${rest.writeCount} REST writes) ====`);
  await log(`summaries: ${JSON.stringify(summaries)}`);
  await log(`resolver stats: ${JSON.stringify(resolver.stats)}`);
}

await main();
