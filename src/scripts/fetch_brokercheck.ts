#!/usr/bin/env node
// @ts-nocheck
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BrokerCheckBlocked, BrokerCheckClient, unwrapFirm, unwrapIndividual } from "../lib/brokercheck.js";
import { HarperREST, Resolver, loadFirm, loadIndividual } from "../lib/brokercheck-load.js";
import { parseFirm, parseIndividual } from "../lib/brokercheck-parse.js";

const STATE_FILE = "research/brokercheck-state.json";
const SKIP_RECENT_DAYS = 7;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

export async function loadState(): Promise<any> {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return { individuals: {}, firms: {} };
  }
}

export async function saveState(state: any): Promise<void> {
  await mkdir("research", { recursive: true });
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function recentlyFetched(value?: string): boolean {
  if (value && typeof value === "object") value = value.fetchedAt;
  if (!value) return false;
  const last = Date.parse(value);
  return Number.isFinite(last) && Date.now() - last < SKIP_RECENT_DAYS * 86_400_000;
}

async function loadIndividualContent(content: any, write: boolean, rest = new HarperREST(), resolver = new Resolver(rest)): Promise<Record<string, number>> {
  return await loadIndividual(parseIndividual(content), content, { rest, resolver, write });
}

async function loadFirmContent(content: any, write: boolean, rest = new HarperREST(), resolver = new Resolver(rest)): Promise<Record<string, number>> {
  return await loadFirm(parseFirm(content), content, { rest, resolver, write });
}

export async function fetchOneCrd(
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: any,
  crd: string,
  opts: { write?: boolean; force?: boolean; log?: (...args: any[]) => void } = {}
): Promise<Record<string, number> | null> {
  const write = opts.write ?? true;
  const log = opts.log ?? console.error;
  state.individuals ??= {};
  if (!opts.force && recentlyFetched(state.individuals[crd])) {
    log(`[skip] individual ${crd} fetched recently`);
    return null;
  }
  const raw = await client.getIndividual(crd);
  const content = unwrapIndividual(raw);
  if (!content) {
    log(`[warn] individual ${crd}: no content`);
    return null;
  }
  const parsed = parseIndividual(content);
  const counts = await loadIndividual(parsed, content, { rest, resolver, write });
  state.individuals[crd] = {
    fetchedAt: new Date().toISOString(),
    legalName: parsed.advisor?.legalName ?? "",
    counts,
  };
  log(`[individual ${crd}] ${JSON.stringify(counts)}`);
  return counts;
}

export async function fetchOneFirm(
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: any,
  firmId: string,
  opts: { write?: boolean; force?: boolean; log?: (...args: any[]) => void } = {}
): Promise<Record<string, number> | null> {
  const write = opts.write ?? true;
  const log = opts.log ?? console.error;
  state.firms ??= {};
  if (!opts.force && recentlyFetched(state.firms[firmId])) {
    log(`[skip] firm ${firmId} fetched recently`);
    return null;
  }
  const raw = await client.getFirm(firmId);
  const content = unwrapFirm(raw);
  if (!content) {
    log(`[warn] firm ${firmId}: no content`);
    return null;
  }
  const parsed = parseFirm(content);
  const counts = await loadFirm(parsed, content, { rest, resolver, write });
  state.firms[firmId] = {
    fetchedAt: new Date().toISOString(),
    name: parsed.firm?.name ?? "",
    counts,
  };
  log(`[firm ${firmId}] ${JSON.stringify(counts)}`);
  return counts;
}

function nameMatches(advisorRow: any, searchHit: any): boolean {
  const aFirst = (advisorRow.firstName ?? "").toLowerCase();
  const aLast = (advisorRow.lastName ?? "").toLowerCase();
  const sFirst = (searchHit.ind_firstname ?? "").toLowerCase();
  const sLast = (searchHit.ind_lastname ?? "").toLowerCase();
  if (aFirst && aLast) return aFirst === sFirst && aLast === sLast;
  const legal = (advisorRow.legalName ?? "").toLowerCase();
  return Boolean(sFirst && sLast && legal.includes(sFirst) && legal.includes(sLast));
}

export async function enrichExistingAdvisors(
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: any,
  opts: { write?: boolean; max?: number; force?: boolean; log?: (...args: any[]) => void } = {}
): Promise<Record<string, number>> {
  const write = opts.write ?? true;
  const max = opts.max ?? 0;
  const log = opts.log ?? console.error;
  const advisors = (await rest.get("/Advisor/")) ?? [];
  let targets = advisors.filter((advisor: any) => !advisor.finraCrd);
  if (max) targets = targets.slice(0, max);
  const summary = { matched: 0, no_match: 0, ambiguous: 0, loaded: 0 };
  log(`[enrich] ${targets.length}/${advisors.length} advisors lack finraCrd`);
  for (const advisor of targets) {
    const legalName = (advisor.legalName ?? "").trim();
    if (!legalName) continue;
    const raw = await client.searchIndividual(legalName, undefined, 0, 5);
    const hits = raw?.hits?.hits ?? [];
    const candidates = hits
      .map((hit: any) => hit?._source ?? {})
      .filter((source: any) => nameMatches(advisor, source));
    if (candidates.length !== 1) {
      summary[candidates.length ? "ambiguous" : "no_match"]++;
      log(`[enrich] ${legalName}: ${candidates.length ? "ambiguous" : "no exact match"} (${hits.length} hits)`);
      continue;
    }
    const crd = String(candidates[0].ind_source_id ?? candidates[0].individualId ?? "");
    if (!crd) {
      summary.no_match++;
      continue;
    }
    summary.matched++;
    const counts = await fetchOneCrd(client, rest, resolver, state, crd, { write, force: opts.force, log });
    if (counts) summary.loaded++;
    await saveState(state);
  }
  return summary;
}

export async function crawlFirmRoster(
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: any,
  firmId: string,
  opts: { write?: boolean; max?: number; force?: boolean; log?: (...args: any[]) => void } = {}
): Promise<Record<string, number>> {
  const write = opts.write ?? true;
  const max = opts.max ?? 0;
  const log = opts.log ?? console.error;
  const summary = { fetched: 0, skipped: 0, errors: 0 };
  let seen = 0;
  for (let page = 0; ; page++) {
    const raw = await client.firmRoster(firmId, page, 50);
    const hits = raw?.hits?.hits ?? [];
    if (!hits.length) break;
    log(`[roster ${firmId}] page ${page}: ${hits.length} hits`);
    for (const hit of hits) {
      const source = hit?._source ?? {};
      const crd = String(source.ind_source_id ?? source.individualId ?? "");
      if (!crd) continue;
      seen++;
      if (max && seen > max) return summary;
      try {
        const counts = await fetchOneCrd(client, rest, resolver, state, crd, { write, force: opts.force, log });
        if (counts) summary.fetched++;
        else summary.skipped++;
      } catch (error) {
        summary.errors++;
        log(`[roster ${firmId}] ${crd}: ${error}`);
      }
      await saveState(state);
    }
    if (hits.length < 50) break;
  }
  return summary;
}

export async function crawlNameSearch(
  client: BrokerCheckClient,
  rest: HarperREST,
  resolver: Resolver,
  state: any,
  query: string,
  opts: { write?: boolean; max?: number; force?: boolean; log?: (...args: any[]) => void } = {}
): Promise<Record<string, number>> {
  const max = opts.max ?? 25;
  const log = opts.log ?? console.error;
  const raw = await client.searchIndividual(query, undefined, 0, max);
  const hits = raw?.hits?.hits ?? [];
  const summary = { fetched: 0, skipped: 0, errors: 0 };
  for (const hit of hits.slice(0, max || hits.length)) {
    const crd = String(hit?._source?.ind_source_id ?? hit?._source?.individualId ?? "");
    if (!crd) continue;
    try {
      const counts = await fetchOneCrd(client, rest, resolver, state, crd, opts);
      if (counts) summary.fetched++;
      else summary.skipped++;
    } catch (error) {
      summary.errors++;
      log(`[search ${query}] ${crd}: ${error}`);
    }
    await saveState(state);
  }
  return summary;
}

export async function main(): Promise<void> {
  const dryRun = has("--dry-run");
  const write = !dryRun;
  const max = Number(arg("--max") ?? "12");
  const rateSeconds = arg("--rate-seconds") ? Number(arg("--rate-seconds")) : undefined;
  const quiet = has("--quiet");
  const log = quiet ? () => undefined : console.error;
  const client = new BrokerCheckClient({ rateSeconds, verbose: !quiet });
  const state = await loadState();
  const fromFixture = arg("--from-fixture");
  const rest = dryRun && fromFixture
    ? { readCount: 0, writeCount: 0, get: async () => [], put: async () => false }
    : new HarperREST({ verbose: !quiet });
  const resolver = new Resolver(rest);

  try {
    if (fromFixture) {
      const raw = JSON.parse(await readFile(fromFixture, "utf8"));
      const individual = unwrapIndividual(raw);
      const firm = unwrapFirm(raw);
      const counts = individual
        ? await loadIndividualContent(individual, write, rest, resolver)
        : firm
          ? await loadFirmContent(firm, write, rest, resolver)
          : {};
      console.log(JSON.stringify(counts, null, 2));
      return;
    }

    if (arg("--crd")) {
      const crd = arg("--crd")!;
      console.log(JSON.stringify(await fetchOneCrd(client, rest, resolver, state, crd, { write, force: has("--force"), log }), null, 2));
      await saveState(state);
      return;
    }

    if (arg("--firm-id")) {
      const firmId = arg("--firm-id")!;
      console.log(JSON.stringify(await fetchOneFirm(client, rest, resolver, state, firmId, { write, force: has("--force"), log }), null, 2));
      await saveState(state);
      return;
    }

    if (has("--enrich")) {
      console.log(JSON.stringify(await enrichExistingAdvisors(client, rest, resolver, state, { write, max, force: has("--force"), log }), null, 2));
      await saveState(state);
      return;
    }

    if (arg("--search-name")) {
      console.log(JSON.stringify(await crawlNameSearch(client, rest, resolver, state, arg("--search-name")!, { write, max, force: has("--force"), log }), null, 2));
      await saveState(state);
      return;
    }

    if (arg("--firm-roster")) {
      const firmId = arg("--firm-roster")!;
      console.log(JSON.stringify(await crawlFirmRoster(client, rest, resolver, state, firmId, { write, max, force: has("--force"), log }), null, 2));
      await saveState(state);
      return;
    }

    throw new Error("one mode required: --crd, --firm-id, --enrich, --search-name, --firm-roster, or --from-fixture");
  } catch (error) {
    if (error instanceof BrokerCheckBlocked) {
      console.error(error.message);
      process.exitCode = 75;
      return;
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
