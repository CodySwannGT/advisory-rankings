// @ts-nocheck
// Firm profile auxiliary sections.

import { api, fmtDate, humanize, initials, entityPath } from "./app.js";
import {
  el,
  Avatar,
  SectionCard,
  EntityList,
  EntityRow,
  DetailsCard,
  Tag,
  Heading,
  Paginated,
  SourceAttribution,
} from "./design-system/index.js";

/**
 * Builds the firm details right-rail card.
 * @param f - Firm profile record.
 * @returns Details card node.
 */
export function firmDetailsCard(f) {
  return DetailsCard({
    title: "Firm details",
    pairs: [
      ["Channel", humanize(f.channel)],
      ["Sub-channel", humanize(f.subChannel)],
      [
        "Headquarters",
        [f.hqCity, f.hqState, f.hqCountry].filter(Boolean).join(", "),
      ],
      ["Founded", f.foundedYear],
      [
        "Dissolved",
        f.dissolvedYear
          ? [f.dissolvedYear, humanize(f.dissolutionReason)]
              .filter(Boolean)
              .join(" · ")
          : null,
      ],
      ["FINRA CRD", f.finraCrd],
      ["SEC filer ID", f.secFilerId],
      [
        "Website",
        f.website
          ? el(
              "a",
              { href: f.website, target: "_blank", rel: "noreferrer" },
              f.website
            )
          : null,
      ],
    ],
  });
}

/**
 * Builds the BrokerCheck regulatory-record card.
 * @param snapshot - BrokerCheck snapshot row.
 * @returns Regulatory card or null.
 */
export function regulatoryCard(snapshot) {
  return snapshot
    ? SectionCard({
        body: [
          Heading({
            level: 3,
            attrs: { class: "card-subtitle" },
            children: "Regulatory record",
          }),
          el(
            "div",
            { class: "kv-list" },
            _kvRow("FINRA scope (BD)", snapshot.bcScope),
            _kvRow("IA scope", snapshot.iaScope),
            _kvRow("Disclosures", snapshot.disclosureCount ?? "—"),
            _kvRow("State registrations", snapshot.registeredStateCount ?? "—")
          ),
          SourceAttribution({
            source: "FINRA BrokerCheck",
            url: `https://brokercheck.finra.org/firm/summary/${encodeURIComponent(snapshot.subjectCrd)}`,
            termsUrl: "https://brokercheck.finra.org/terms",
            fetchedAt: snapshot.fetchedAt,
          }),
        ],
      })
    : null;
}

/**
 * Builds the branch list card.
 * @param branches - Branch rows for the firm.
 * @returns Branches card or null.
 */
export function branchesCard(branches) {
  return branches.length
    ? SectionCard({
        body: [
          Heading({
            level: 3,
            attrs: { class: "card-subtitle" },
            children: `Branches (${branches.length.toLocaleString()})`,
          }),
          EntityList({
            rows: branches.map(b =>
              EntityRow({
                avatar: branchAvatar(b),
                name: b.name || b.buildingName || "(unnamed)",
                sub: [b.level, [b.city, b.state].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" · "),
              })
            ),
          }),
        ],
      })
    : null;
}

/**
 * Chooses a compact branch-level avatar letter.
 * @param branch - Branch row.
 * @returns Avatar text.
 */
function branchAvatar(branch) {
  if (branch.level === "market") return "M";
  if (branch.level === "complex") return "C";
  return "B";
}

/**
 * Handles kv row for this workflow.
 * @param k - k used by this operation.
 * @param v - v used by this operation.
 * @returns The computed value.
 */
function _kvRow(k, v) {
  if (v === null || v === undefined || v === "") return el("span");
  return el(
    "div",
    { class: "kv-row" },
    el("span", { class: "kv-key" }, k),
    el("span", { class: "kv-val" }, String(v))
  );
}

/**
 * Handles advisor row for this workflow.
 * @param r - r used by this operation.
 * @param root0 - value used by this operation.
 * @param root0.showStart - show start used by this operation.
 * @param root0.showEnd - show end used by this operation.
 * @returns The computed value.
 */
export function advisorRow(r, { showStart = false, showEnd = false } = {}) {
  const a = r.advisor;
  const sub = [r.roleTitle, humanize(r.roleCategory)]
    .filter(Boolean)
    .join(" · ");
  const tail = advisorTail(r, { showStart, showEnd });
  return EntityRow({
    avatar: Avatar({
      initials: initials(a.name),
      imageUrl: a.headshotUrl,
      alt: a.name,
    }),
    name: a.name,
    sub,
    tail:
      r.reasonForLeaving === "terminated_for_cause"
        ? [
            tail,
            Tag({
              kind: "danger",
              attrs: { style: "margin-top:2px;display:block;" },
              children: "terminated",
            }),
          ]
        : tail,
    href: entityPath("advisor", a),
  });
}

/**
 * Builds display tags for firm profile status and channels.
 * @param f - Firm profile record.
 * @returns Tags for ProfileHead.
 */
export function firmTags(f) {
  return [
    humanize(f.channel) ? { label: humanize(f.channel) } : null,
    humanize(f.subChannel) ? { label: humanize(f.subChannel) } : null,
    f.dissolvedYear
      ? { kind: "danger", label: `dissolved ${f.dissolvedYear}` }
      : null,
    f.parentFirmId ? { kind: "warn", label: "subsidiary" } : null,
  ].filter(Boolean);
}

/**
 * Builds location, founding, and CRD subtitle text for a firm.
 * @param f - Firm profile record.
 * @returns Subtitle text for ProfileHead.
 */
export function firmSubtitle(f) {
  return [
    f.hqCity || f.hqState
      ? [f.hqCity, f.hqState].filter(Boolean).join(", ")
      : null,
    f.foundedYear ? `founded ${f.foundedYear}` : null,
    f.finraCrd ? `FINRA CRD ${f.finraCrd}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Builds the date label for a firm advisor row.
 * @param row - Firm advisor row.
 * @param root0 - Date display options.
 * @param root0.showStart - Whether to show a since label.
 * @param root0.showEnd - Whether to show a start/end range.
 * @returns Tail text for the advisor row.
 */
export function advisorTail(row, { showStart = false, showEnd = false } = {}) {
  if (showStart && row.startDate)
    return `since ${fmtDate(row.startDate, { mode: "short" })}`;
  if (showEnd && row.endDate)
    return `${fmtDate(row.startDate, { mode: "short" })} – ${fmtDate(row.endDate, { mode: "short" })}`;
  if (row.startDate) return fmtDate(row.startDate, { mode: "short" });
  return "";
}

/**
 * Builds the paginated advisor list for current or past firm rosters.
 * @param firmId - Firm identifier.
 * @param status - status used by this operation.
 * @param opts - Options controlling the operation.
 * @returns Paginated advisor list node.
 */
export function paginatedAdvisors(firmId, status, opts) {
  return Paginated({
    fetchPage: async cursor => {
      const qs = new URLSearchParams({ status, limit: "50" });
      if (cursor) qs.set("cursor", cursor);
      return api(`/FirmAdvisors/${encodeURIComponent(firmId)}?${qs}`);
    },
    empty:
      status === "past"
        ? "No past advisors on file."
        : "No current advisors on file.",
    renderRow: r => advisorRow(r, opts),
  });
}
