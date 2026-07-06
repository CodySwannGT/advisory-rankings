import * as cheerio from "cheerio";

import {
  cleanText,
  normalizePhone,
  normalizeUrl,
} from "./morgan-stanley-row-utils.js";
import type { RbcAdvisorSource, RbcBranchSource } from "./rbc-types.js";

const STATE_NAMES = new Map([
  ["new york", "NY"],
  ["california", "CA"],
  ["florida", "FL"],
  ["texas", "TX"],
  ["new jersey", "NJ"],
]);

/**
 * Parses the RBC finder page for its AJAX nonce.
 * @param html - Finder page HTML.
 * @returns Nonce required by public RBC advisor AJAX actions.
 */
export function parseRbcNonce(html: string): string | undefined {
  return /["']?nonce["']?\s*:\s*"([^"]+)"/u.exec(html)?.[1];
}

/**
 * Parses RBC branch search HTML returned by `rbcwm_get_advisors_branches`.
 * @param html - Branch result HTML fragment.
 * @returns Branch rows available for advisor expansion.
 */
export function parseRbcBranches(html: string): ReadonlyArray<RbcBranchSource> {
  const $ = cheerio.load(html);
  return $(".rbcwm-advisors-branch-advisors-expandable-trigger")
    .toArray()
    .map(element => parseBranch($, element))
    .filter((branch): branch is RbcBranchSource => Boolean(branch));
}

/**
 * Parses RBC advisor HTML returned by `rbcwm_get_advisors_by_branch`.
 * @param html - Advisor result HTML fragment.
 * @param branch - Branch associated with the advisor result.
 * @returns Advisor rows with branch context.
 */
export function parseRbcAdvisors(
  html: string,
  branch: RbcBranchSource
): ReadonlyArray<RbcAdvisorSource> {
  const $ = cheerio.load(html);
  return $(".rbc-caption-text")
    .toArray()
    .map(element => parseAdvisor($, element, branch))
    .filter((advisor): advisor is RbcAdvisorSource => Boolean(advisor));
}

const parseBranch = (
  $: cheerio.CheerioAPI,
  element: Parameters<cheerio.CheerioAPI>[0]
): RbcBranchSource | null => {
  const root = $(element);
  const branchId = String(
    root
      .find(".rbcwm-advisors-branch-advisors-expandable-btn")
      .data("branch_id") ?? ""
  );
  const name = cleanText(root.find("h3").first().text());
  if (!branchId || !name) return null;
  const addressText = cleanText(root.find("address").text());
  return {
    branchId,
    name,
    distance: cleanText(root.find(".category").first().text()),
    branchUrl: normalizeUrl(root.find("a[href]").first().attr("href")),
    ...parseAddress(addressText),
  };
};

const parseAdvisor = (
  $: cheerio.CheerioAPI,
  element: Parameters<cheerio.CheerioAPI>[0],
  branch: RbcBranchSource
): RbcAdvisorSource | null => {
  const root = $(element);
  const advisorName = cleanText(root.find("h3").first().text());
  if (!advisorName) return null;
  const links = root.find("a[href]").toArray();
  const tel = links
    .map(link => $(link).attr("href"))
    .find(href => href?.startsWith("tel:"));
  const mail = links
    .map(link => $(link).attr("href"))
    .find(href => href?.startsWith("mailto:"));
  const site = links
    .map(link => $(link).attr("href"))
    .find(
      href => href && !href.startsWith("tel:") && !href.startsWith("mailto:")
    );
  return {
    advisorName,
    advisorUrl: normalizeUrl(site),
    businessEmail: mail?.replace(/^mailto:/u, ""),
    businessPhone: normalizePhone(tel?.replace(/^tel:/u, "")),
    headshotUrl: parseHeadshot(root.closest(".rbc-caption").html() ?? ""),
    branch,
  };
};

const parseAddress = (value: string): Partial<RbcBranchSource> => {
  const parts = value.split(",").map(cleanText).filter(Boolean);
  const postalCode = parts.at(-1);
  const stateValue = parts.at(-2);
  const city = parts.at(-3);
  const state = stateValue
    ? (STATE_NAMES.get(stateValue.toLowerCase()) ?? stateValue)
    : undefined;
  return {
    address: parts.slice(0, -3).join(", "),
    city,
    state,
    postalCode,
  };
};

const parseHeadshot = (html: string): string | undefined => {
  const match = /background-image:\s*url\(([^)]+)\)/u.exec(html);
  return normalizeUrl(match?.[1]);
};
