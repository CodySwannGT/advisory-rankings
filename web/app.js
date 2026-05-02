// Tiny browser for the auto-generated REST endpoints. Relies on the
// browser's stored basic-auth credentials (Harper requires auth on all
// REST routes; the static files are protected by the same realm so the
// prompt only fires once per session).

const TABLES = [
  "Firm", "FirmSuccession", "Branch", "BranchAssignment",
  "Advisor", "Education", "Designation", "License",
  "EmploymentHistory", "RegistrationApplication",
  "Team", "TeamMembership", "TeamMetricSnapshot", "AdvisorMetricSnapshot",
  "TransitionEvent", "RecruitingDealQuote",
  "Disclosure", "DisclosureCluster", "Sanction",
  "OutsideBusinessActivity", "EmployerConcentration",
  "Ranking", "RankingEntry",
  "Article", "ArticleAdvisorMention", "ArticleFirmMention",
  "ArticleTeamMention", "ArticleTransitionEventMention",
  "ArticleDisclosureMention", "FieldAssertion",
  "User", "UserRating", "UserList", "UserListEntry",
];

// Columns to feature first when rendering each table.
const FEATURED_COLS = {
  Firm: ["name", "channel", "hqCity", "hqState"],
  Advisor: ["legalName", "careerStatus", "yearsExperience"],
  Branch: ["name", "level", "city", "state"],
  Team: ["name", "serviceModel"],
  TeamMembership: ["teamId", "advisorId", "role"],
  TeamMetricSnapshot: ["teamId", "asOf", "aum", "annualRevenue"],
  EmploymentHistory: ["advisorId", "firmId", "roleTitle", "startDate", "endDate"],
  RegistrationApplication: ["advisorId", "firmId", "status", "appliedDate"],
  TransitionEvent: ["subjectTeamId", "fromFirmId", "toFirmId", "moveDate", "aumMoved"],
  RecruitingDealQuote: ["firmId", "producerTier", "upfrontPctT12"],
  Disclosure: ["advisorId", "disclosureType", "regulator", "status"],
  DisclosureCluster: ["rootEventDescription"],
  Sanction: ["disclosureId", "sanctionType", "amount", "durationMonths", "jurisdiction"],
  OutsideBusinessActivity: ["advisorId", "name", "vehicleType", "withCustomers"],
  EmployerConcentration: ["subjectId", "employerName", "clientRoleType"],
  Article: ["headline", "publishedDate", "category"],
  ArticleAdvisorMention: ["articleId", "advisorId"],
  ArticleFirmMention: ["articleId", "firmId"],
  ArticleTeamMention: ["articleId", "teamId"],
  ArticleTransitionEventMention: ["articleId", "transitionEventId"],
  ArticleDisclosureMention: ["articleId", "disclosureId"],
  FieldAssertion: ["targetTable", "targetId", "fieldName", "assertedValue"],
  BranchAssignment: ["branchId", "advisorId", "role", "effectiveFrom"],
};

const FK_FIELDS = {
  parentFirmId: "Firm",
  firmId: "Firm",
  fromFirmId: "Firm",
  toFirmId: "Firm",
  currentFirmId: "Firm",
  predecessorFirmId: "Firm",
  successorFirmId: "Firm",
  firmIdAtTime: "Firm",
  branchId: "Branch",
  parentBranchId: "Branch",
  fromBranchId: "Branch",
  toBranchId: "Branch",
  currentBranchId: "Branch",
  advisorId: "Advisor",
  subjectAdvisorId: "Advisor",
  teamId: "Team",
  subjectTeamId: "Team",
  subjectFirmId: "Firm",
  articleId: "Article",
  disclosureId: "Disclosure",
  clusterId: "DisclosureCluster",
  primaryDisclosureId: "Disclosure",
  recruitingDealId: "RecruitingDealQuote",
  appliesToTransitionEventId: "TransitionEvent",
  transitionEventId: "TransitionEvent",
  rankingId: "Ranking",
  listId: "UserList",
  userId: "User",
  terminationDisclosureId: "Disclosure",
};

const HIGHLIGHTS = [
  {
    label: "Taylor Group team move",
    sub: "$5.94B from Morgan Stanley to Wells Fargo",
    table: "TransitionEvent",
  },
  {
    label: "Cairnes disclosure cluster",
    sub: "5 parallel events on one OBA",
    table: "Disclosure",
  },
  { label: "Stacked sanctions",        sub: "fine + suspension + bar",    table: "Sanction" },
  { label: "Field-assertion provenance", sub: "facts → quote → article",  table: "FieldAssertion" },
];

const cache = new Map();
const labelCache = new Map();
let activeTable = null;

const $ = (id) => document.getElementById(id);

function fmtAum(n) {
  if (typeof n !== "number") return n;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function fmtDate(s) {
  if (!s || typeof s !== "string") return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

async function fetchTable(name) {
  if (cache.has(name)) return cache.get(name);
  const r = await fetch(`/${name}/`, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    cache.set(name, []);
    return [];
  }
  const rows = await r.json();
  cache.set(name, rows);
  for (const row of rows) {
    if (row && row.id) {
      labelCache.set(`${name}:${row.id}`, labelFor(name, row));
    }
  }
  return rows;
}

function labelFor(table, row) {
  if (row.legalName) return row.legalName;
  if (row.name) return row.name;
  if (row.headline) return row.headline;
  if (row.rootEventDescription) return row.rootEventDescription.slice(0, 60);
  if (table === "TransitionEvent" && row.moveDate) return `move ${fmtDate(row.moveDate)}`;
  if (table === "Sanction") return [row.sanctionType, row.jurisdiction].filter(Boolean).join(" / ");
  if (table === "Disclosure") return [row.disclosureType, row.regulator].filter(Boolean).join(" / ");
  if (table === "TeamMembership") return row.role || "membership";
  if (row.targetTable && row.fieldName) return `${row.targetTable}.${row.fieldName}`;
  return row.id?.slice(0, 8) ?? "?";
}

function isJsonValue(v) {
  return Array.isArray(v) || (v && typeof v === "object");
}

function renderCell(table, col, value) {
  if (value == null || value === "") return "";
  if (FK_FIELDS[col]) {
    const target = FK_FIELDS[col];
    const label = labelCache.get(`${target}:${value}`);
    return `<a href="#${target}/${value}" class="fk" data-table="${target}" data-id="${value}">${label ?? value.slice(0, 12) + "…"}</a>`;
  }
  if (col === "aum" || col === "annualRevenue" || col === "aumMoved" || col === "productionT12" || col === "amount") {
    return fmtAum(value);
  }
  if (col === "upfrontPctT12" && typeof value === "number") {
    return `${(value * 100).toFixed(0)}%`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return fmtDate(value);
  }
  if (isJsonValue(value)) {
    return `<span class="json">${JSON.stringify(value)}</span>`;
  }
  return String(value);
}

function buildSidebar(counts) {
  const nav = $("tables");
  nav.innerHTML = "";
  for (const t of TABLES) {
    const n = counts[t] ?? 0;
    const btn = document.createElement("button");
    btn.dataset.table = t;
    btn.className = n === 0 ? "empty" : "";
    btn.innerHTML = `<span>${t}</span><span class="count">${n || ""}</span>`;
    btn.addEventListener("click", () => navigateTo(t));
    nav.appendChild(btn);
  }
  const ul = $("highlights");
  ul.innerHTML = "";
  for (const h of HIGHLIGHTS) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.innerHTML = `<strong>${h.label}</strong><span>${h.sub}</span>`;
    btn.addEventListener("click", () => navigateTo(h.table));
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function highlightActive(table) {
  for (const btn of document.querySelectorAll("nav#tables button")) {
    btn.classList.toggle("active", btn.dataset.table === table);
  }
}

async function navigateTo(table, id) {
  activeTable = table;
  highlightActive(table);
  if (id) {
    location.hash = `#${table}/${id}`;
    showRecord(table, id);
  } else {
    location.hash = `#${table}`;
    showTable(table);
  }
}

async function showTable(table) {
  $("empty").hidden = true;
  $("record-view").hidden = true;
  const view = $("table-view");
  view.hidden = false;
  $("table-name").textContent = table;
  $("table-summary").textContent = "Loading…";

  const rows = await fetchTable(table);
  $("table-summary").textContent = `${rows.length} row${rows.length === 1 ? "" : "s"}`;

  const cols = pickColumns(table, rows);
  const thead = view.querySelector("thead");
  const tbody = view.querySelector("tbody");
  thead.innerHTML = "<tr>" + cols.map((c) => `<th>${c}</th>`).join("") + "</tr>";
  tbody.innerHTML = "";

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.dataset.id = row.id;
    for (const c of cols) {
      const td = document.createElement("td");
      td.innerHTML = renderCell(table, c, row[c]);
      if (c === "id") td.classList.add("id-cell");
      if (typeof row[c] === "number") td.classList.add("num");
      tr.appendChild(td);
    }
    tr.addEventListener("click", (e) => {
      // Don't intercept FK link clicks
      if (e.target.closest("a.fk")) return;
      navigateTo(table, row.id);
    });
    tbody.appendChild(tr);
  }
}

function pickColumns(table, rows) {
  const featured = FEATURED_COLS[table] || [];
  if (rows.length === 0) return ["id", ...featured];
  const present = new Set();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (k === "createdAt" || k === "updatedAt" || k === "__updatedtime__" || k === "__createdtime__") continue;
      present.add(k);
    }
  }
  const ordered = ["id", ...featured.filter((c) => present.has(c))];
  for (const k of [...present].sort()) {
    if (!ordered.includes(k)) ordered.push(k);
  }
  return ordered;
}

async function showRecord(table, id) {
  $("empty").hidden = true;
  $("table-view").hidden = true;
  const view = $("record-view");
  view.hidden = false;

  const r = await fetch(`/${table}/${id}`, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    $("record-title").textContent = `${table} ${id} — not found`;
    $("record-fields").innerHTML = "";
    return;
  }
  const row = await r.json();
  $("record-title").innerHTML = `${table} <span style="color:var(--text-dim);font-weight:400">— ${labelFor(table, row)}</span>`;

  const dl = $("record-fields");
  dl.innerHTML = "";
  const keys = Object.keys(row).sort((a, b) => {
    if (a === "id") return -1;
    if (b === "id") return 1;
    return a.localeCompare(b);
  });
  for (const k of keys) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.innerHTML = renderCell(table, k, row[k]);
    if (isJsonValue(row[k])) dd.classList.add("json");
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a.fk");
  if (a) {
    e.preventDefault();
    navigateTo(a.dataset.table, a.dataset.id);
  }
});

$("back").addEventListener("click", () => {
  if (activeTable) navigateTo(activeTable);
});

window.addEventListener("hashchange", route);

function route() {
  const m = location.hash.match(/^#([A-Za-z]+)(?:\/([\w-]+))?$/);
  if (!m) return;
  navigateTo(m[1], m[2]);
}

(async function bootstrap() {
  const counts = {};
  let total = 0;
  // Fetch in batches of 6 to stay polite.
  for (let i = 0; i < TABLES.length; i += 6) {
    const slice = TABLES.slice(i, i + 6);
    const got = await Promise.all(slice.map((t) => fetchTable(t).then((r) => [t, r.length])));
    for (const [t, n] of got) {
      counts[t] = n;
      total += n;
    }
  }
  buildSidebar(counts);
  $("totals").textContent = `${total} rows · ${Object.values(counts).filter((n) => n > 0).length} populated tables`;
  $("cluster").textContent = location.host;

  if (location.hash) {
    route();
  }
})();
