// @ts-nocheck
import { createHash } from "node:crypto";
import {
  advisorId as canonicalAdvisorId,
  disclosureId,
  employmentHistoryId,
  firmId as canonicalFirmId,
  sanctionId,
  slugify,
  uid,
} from "./ids.js";

export class HarperREST {
  base: string;
  auth: string;
  timeoutMs: number;
  verbose: boolean;
  writeCount = 0;
  readCount = 0;

  constructor(opts: {
    baseUrl?: string;
    user?: string;
    password?: string;
    timeoutMs?: number;
    verbose?: boolean;
  } = {}) {
    this.base = (opts.baseUrl ?? process.env.HDB_TARGET_URL ?? "").replace(/\/+$/, "");
    if (!this.base) throw new Error("HDB_TARGET_URL required for Harper REST writes");
    const user = (opts.user ?? process.env.HDB_ADMIN_USERNAME ?? process.env.HARPER_ADMIN_USERNAME ?? "").replace(/^[“"']+|[”"']+$/g, "");
    const password = (opts.password ?? process.env.HDB_ADMIN_PASSWORD ?? process.env.HARPER_ADMIN_PASSWORD ?? "").replace(/^[“"']+|[”"']+$/g, "");
    if (!user || !password) throw new Error("Harper admin credentials missing");
    this.auth = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.verbose = opts.verbose ?? true;
  }

  async get(path: string, params?: Record<string, unknown>): Promise<any> {
    this.readCount++;
    const url = new URL(`${this.base}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", Authorization: this.auth },
        signal: controller.signal,
      });
      if (!res.ok) {
        if (this.verbose) console.error(`  ! GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return null;
      }
      const text = await res.text();
      return text.trim() ? JSON.parse(text) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  async put(table: string, record: Record<string, unknown>): Promise<boolean> {
    const id = record.id;
    if (!id) throw new Error(`PUT requires id; got ${JSON.stringify(record)}`);
    this.writeCount++;
    const res = await fetch(`${this.base}/${table}/${encodeURIComponent(String(id))}`, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: this.auth,
      },
      body: JSON.stringify(dropUnderscored(record)),
    });
    if (![200, 201, 204].includes(res.status)) {
      console.error(`  ! PUT /${table}/${id} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  }
}

export function dropUnderscored(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key, value]) => !key.startsWith("_") && value != null)
  );
}

export class Resolver {
  rest: HarperREST;
  cache = new Map<string, string>();
  firmListing: any[] | null = null;
  advisorListing: any[] | null = null;
  stats = {
    advisor_matched_crd: 0, advisor_matched_name: 0, advisor_minted: 0,
    firm_matched_crd: 0, firm_matched_name: 0, firm_minted: 0,
    disclosure_matched: 0, disclosure_minted: 0,
    employment_matched: 0, employment_minted: 0,
    sanction_matched: 0, sanction_minted: 0,
    license_matched: 0, license_minted: 0,
  };

  constructor(rest: HarperREST) {
    this.rest = rest;
  }

  async firm(names: string[], finraCrd?: string): Promise<string> {
    names = names.filter(Boolean);
    const cacheKey = JSON.stringify(["firm", finraCrd ?? "", names]);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;
    if (finraCrd) {
      const hit = await this.rest.get("/Firm/", { finraCrd });
      if (Array.isArray(hit) && hit.length) {
        this.stats.firm_matched_crd++;
        this.cache.set(cacheKey, hit[0].id);
        return hit[0].id;
      }
    }
    this.firmListing ??= (await this.rest.get("/Firm/")) ?? [];
    for (const n of names) {
      for (const f of this.firmListing) {
        if (firmNameMatch(f.name ?? "", n)) {
          this.stats.firm_matched_name++;
          this.cache.set(cacheKey, f.id);
          return f.id;
        }
      }
    }
    const id = canonicalFirmId(names[0] ?? `firm-crd-${finraCrd ?? "unknown"}`);
    this.stats.firm_minted++;
    this.cache.set(cacheKey, id);
    return id;
  }

  async advisor(finraCrd: string, legalName: string, opts: { firstEmployer?: string; firstName?: string; lastName?: string } = {}): Promise<string> {
    const cacheKey = JSON.stringify(["advisor", finraCrd, legalName]);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;
    if (finraCrd) {
      const hit = await this.rest.get("/Advisor/", { finraCrd });
      if (Array.isArray(hit) && hit.length) {
        this.stats.advisor_matched_crd++;
        this.cache.set(cacheKey, hit[0].id);
        return hit[0].id;
      }
    }
    this.advisorListing ??= (await this.rest.get("/Advisor/")) ?? [];
    if (legalName) {
      const lower = legalName.toLowerCase();
      const match = this.advisorListing.find(r => (r.legalName ?? "").toLowerCase() === lower);
      if (match) {
        this.stats.advisor_matched_name++;
        this.cache.set(cacheKey, match.id);
        return match.id;
      }
    }
    const first = (opts.firstName ?? "").toLowerCase();
    const last = (opts.lastName ?? "").toLowerCase();
    if (first && last) {
      const firstLast = this.advisorListing.filter(r => (r.firstName ?? "").toLowerCase() === first && (r.lastName ?? "").toLowerCase() === last);
      if (firstLast.length === 1) {
        this.stats.advisor_matched_name++;
        this.cache.set(cacheKey, firstLast[0].id);
        return firstLast[0].id;
      }
      if (firstLast.length === 0) {
        const lastOnly = this.advisorListing.filter(r => (r.lastName ?? "").toLowerCase() === last);
        if (lastOnly.length === 1) {
          const candFirst = (lastOnly[0].firstName ?? "").toLowerCase().replace(/\.$/, "");
          const cleanFirst = first.replace(/\.$/, "");
          if (candFirst.startsWith(cleanFirst) || cleanFirst.startsWith(candFirst)) {
            this.stats.advisor_matched_name++;
            this.cache.set(cacheKey, lastOnly[0].id);
            return lastOnly[0].id;
          }
        }
      }
    }
    const hint = finraCrd ? `crd-${finraCrd}` : (opts.firstEmployer ?? "");
    const id = canonicalAdvisorId(legalName, hint);
    this.stats.advisor_minted++;
    this.cache.set(cacheKey, id);
    return id;
  }

  async disclosure(advisorIdValue: string, disclosureType: string, dateInitiated: string, docketNumber?: string, regulator = ""): Promise<string> {
    const cacheKey = JSON.stringify(["disc", advisorIdValue, disclosureType, datePrefix(dateInitiated), docketNumber ?? "", regulator]);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;
    const existing = await this.rest.get("/Disclosure/", { advisorId: advisorIdValue });
    if (Array.isArray(existing)) {
      for (const d of existing) {
        if (d.disclosureType === disclosureType && datePrefix(d.dateInitiated) === datePrefix(dateInitiated) && ((docketNumber && d.docketNumber === docketNumber) || !docketNumber)) {
          this.stats.disclosure_matched++;
          this.cache.set(cacheKey, d.id);
          return d.id;
        }
      }
    }
    const id = disclosureId(advisorIdValue, disclosureType, datePrefix(dateInitiated), docketNumber || regulator);
    this.stats.disclosure_minted++;
    this.cache.set(cacheKey, id);
    return id;
  }

  employment(advisorIdValue: string, firmIdValue: string, startDate: string): string {
    const id = employmentHistoryId(advisorIdValue, firmIdValue, datePrefix(startDate));
    return id;
  }

  sanction(disclosureIdValue: string, sanctionType: string, amount?: number, duration?: number): string {
    return sanctionId(disclosureIdValue, sanctionType, String(amount || ""), String(duration || ""));
  }

  license(advisorIdValue: string, licenseType: string, grantedDate: string): string {
    return uid(`lic:${advisorIdValue}:${slugify(licenseType)}:${datePrefix(grantedDate)}`);
  }
}

function firmNameMatch(a: string, b: string): boolean {
  return Boolean(a && b) && normalizeFirmName(a) === normalizeFirmName(b);
}

function normalizeFirmName(value: string): string {
  let s = value.toLowerCase().trim().replace(/[,.]/g, " ");
  for (const token of [" llc", " l l c", " inc", " l p", " lp", " corporation", " corp"]) {
    if (s.endsWith(token)) s = s.slice(0, -token.length);
  }
  return s.split(/\s+/).join(" ");
}

export function datePrefix(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function hashContent(content: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortForHash(content))).digest("hex");
}

function sortForHash(value: any): any {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortForHash(value[key])]));
  }
  return value;
}

export async function loadIndividual(parsed: any, rawContent: any, opts: { rest: HarperREST; resolver: Resolver; write?: boolean }): Promise<Record<string, number>> {
  const { rest, resolver } = opts;
  const write = opts.write ?? true;
  const a = parsed.advisor;
  const crd = a.finraCrd || "";
  if (!crd) throw new Error("parsed individual missing finraCrd");
  const snapshotId = uid(`bcsnap:individual:${crd}`);
  const advisorUuid = await resolver.advisor(crd, a.legalName ?? "", {
    firstEmployer: parsed.employments.at(-1)?._firmName ?? "",
    firstName: a.firstName ?? "",
    lastName: a.lastName ?? "",
  });
  const employmentRows = [];
  const firmRows = [];
  const firmIds = [];
  for (const emp of parsed.employments) {
    const firmUuid = await resolver.firm(emp._firmName ? [emp._firmName] : [], emp._firmFinraId);
    firmIds.push(firmUuid);
    employmentRows.push({
      id: resolver.employment(advisorUuid, firmUuid, emp.startDate ?? ""),
      advisorId: advisorUuid,
      firmId: firmUuid,
      startDate: emp.startDate,
      endDate: emp.endDate,
      sourceType: "brokercheck",
      sourceRef: snapshotId,
    });
  }
  const seen = new Set<string>();
  const listingById = Object.fromEntries((resolver.firmListing ?? []).map(f => [f.id, f]));
  for (let i = 0; i < parsed.employments.length; i++) {
    const fid = firmIds[i];
    if (seen.has(fid)) continue;
    seen.add(fid);
    const emp = parsed.employments[i];
    const name = String(emp._firmName ?? "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replaceAll("Llc", "LLC").replaceAll("Lp", "LP");
    const update = { id: fid, name: name || null, finraCrd: emp._firmFinraId || null };
    const existing = listingById[fid];
    firmRows.push(existing ? { ...existing, ...Object.fromEntries(Object.entries(update).filter(([, v]) => v != null)), name: existing.name || update.name } : {
      ...update,
      channel: emp._iaOnly ? "pure_ria" : "unknown",
      notes: `Auto-discovered via FINRA BrokerCheck (firmId=${emp._firmFinraId}, snapshot=${snapshotId})`,
    });
  }
  const disclosureRows = [];
  const sanctionRows = [];
  for (const d of parsed.disclosures) {
    const dd = d.disclosure;
    const did = await resolver.disclosure(advisorUuid, dd.disclosureType ?? "", dd.dateInitiated ?? "", dd.docketNumber, dd.regulator ?? "");
    disclosureRows.push({ ...dd, id: did, advisorId: advisorUuid, sourceType: "brokercheck", sourceRef: snapshotId });
    for (const s of d.sanctions) {
      sanctionRows.push({ ...s, id: resolver.sanction(did, s.sanctionType ?? "", s.amount, s.durationMonths), disclosureId: did });
    }
  }
  const licenseRows = parsed.licenses.map(L => ({
    id: resolver.license(advisorUuid, L.licenseType ?? "", L.grantedDate ?? ""),
    advisorId: advisorUuid,
    licenseType: L.licenseType,
    grantedDate: L.grantedDate,
    status: "active",
  }));
  const advisorRow = { ...a, id: advisorUuid };
  const summary = parsed.summary ?? {};
  const snapshotRow = {
    id: snapshotId,
    subjectKind: "individual",
    subjectCrd: crd,
    subjectAdvisorId: advisorUuid,
    fetchedAt: nowIso(),
    bcScope: summary.bcScope ?? "",
    iaScope: summary.iaScope ?? "",
    disclosureCount: summary.disclosureCount ?? 0,
    employmentCount: summary.employmentCount ?? 0,
    examCount: summary.examCount ?? 0,
    registeredStateCount: summary.registeredStateCount ?? 0,
    rawHash: hashContent(rawContent),
    rawJson: JSON.stringify(rawContent),
  };
  if (!write) {
    return { Firm: firmRows.length, Advisor: 1, EmploymentHistory: employmentRows.length, Disclosure: disclosureRows.length, Sanction: sanctionRows.length, License: licenseRows.length, BrokerCheckSnapshot: 1 };
  }
  return {
    Firm: await putMany(rest, "Firm", firmRows),
    Advisor: Number(await rest.put("Advisor", advisorRow)),
    EmploymentHistory: await putMany(rest, "EmploymentHistory", employmentRows),
    Disclosure: await putMany(rest, "Disclosure", disclosureRows),
    Sanction: await putMany(rest, "Sanction", sanctionRows),
    License: await putMany(rest, "License", licenseRows),
    BrokerCheckSnapshot: Number(await rest.put("BrokerCheckSnapshot", snapshotRow)),
  };
}

export async function loadFirm(parsed: any, rawContent: any, opts: { rest: HarperREST; resolver: Resolver; write?: boolean }): Promise<Record<string, number>> {
  const { rest, resolver } = opts;
  const write = opts.write ?? true;
  const f = parsed.firm;
  const crd = f.finraCrd || "";
  if (!crd) throw new Error("parsed firm missing finraCrd");
  const firmUuid = await resolver.firm([f._iaFirmName, f.name, f.legalName].filter(Boolean), crd);
  const snapshotId = uid(`bcsnap:firm:${crd}`);
  let firmRow = { ...f, id: firmUuid };
  const listingById = Object.fromEntries((resolver.firmListing ?? []).map(x => [x.id, x]));
  if (listingById[firmUuid]) {
    const existing = listingById[firmUuid];
    firmRow = { ...existing, ...Object.fromEntries(Object.entries(firmRow).filter(([, v]) => v != null)), name: existing.name || firmRow.name };
  } else {
    firmRow.channel ??= "unknown";
    firmRow.notes ??= `Auto-discovered via FINRA BrokerCheck (firmId=${crd}, snapshot=${snapshotId})`;
  }
  const summary = parsed.summary ?? {};
  const snapshotRow = {
    id: snapshotId,
    subjectKind: "firm",
    subjectCrd: crd,
    subjectFirmId: firmUuid,
    fetchedAt: nowIso(),
    bcScope: summary.bcScope ?? "",
    iaScope: summary.iaScope ?? "",
    disclosureCount: (summary.regulatoryDisclosureCount ?? 0) + (summary.arbitrationCount ?? 0) + (summary.civilCount ?? 0),
    employmentCount: 0,
    examCount: 0,
    registeredStateCount: summary.stateRegistrationCount ?? 0,
    rawHash: hashContent(rawContent),
    rawJson: JSON.stringify(rawContent),
  };
  if (!write) return { Firm: 1, BrokerCheckSnapshot: 1 };
  return {
    Firm: Number(await rest.put("Firm", firmRow)),
    BrokerCheckSnapshot: Number(await rest.put("BrokerCheckSnapshot", snapshotRow)),
  };
}

async function putMany(rest: HarperREST, table: string, rows: any[]): Promise<number> {
  let count = 0;
  for (const row of rows) if (await rest.put(table, row)) count++;
  return count;
}
