import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import type {
  WellsFargoAdvisorSource,
  WellsFargoBranchSource,
} from "./wells-fargo-types.js";
import {
  cleanText,
  normalizePhone,
  normalizeUrl,
} from "./morgan-stanley-row-utils.js";

const STATE_RE = /^[A-Z]{2}$/u;
const ZIP_RE = /^\d{5}(?:-\d{4})?$/u;

/**
 * Parses Wells Fargo Advisors locator search HTML into branch candidates.
 * @param html - Search-result page HTML from the public locator.
 * @param sourceUrl - Fully qualified search URL used for provenance fallback.
 * @returns Branch candidates extracted from the result table.
 */
export function parseWellsFargoLocatorBranches(
  html: string,
  sourceUrl: string
): ReadonlyArray<WellsFargoBranchSource> {
  const $ = cheerio.load(html);
  return $("tr")
    .toArray()
    .map(row => parseSearchRow($(row), sourceUrl))
    .filter((branch): branch is WellsFargoBranchSource => Boolean(branch));
}

/**
 * Parses one Wells Fargo Advisors branch page into advisor source records.
 * @param html - Branch profile page HTML.
 * @param branchUrl - Branch profile URL.
 * @param fallbackBranch - Branch fields already known from the locator.
 * @returns Advisor rows with branch context.
 */
export function parseWellsFargoBranchAdvisors(
  html: string,
  branchUrl: string,
  fallbackBranch: WellsFargoBranchSource
): ReadonlyArray<WellsFargoAdvisorSource> {
  const $ = cheerio.load(html);
  const branch = {
    ...fallbackBranch,
    ...branchVariables(html),
    branchUrl,
  };
  return $("#ourFAs li a")
    .toArray()
    .map(anchor => ({
      advisorName: cleanText($(anchor).text()),
      advisorUrl: absoluteUrl($(anchor).attr("href"), branchUrl),
      branch,
    }))
    .filter(source => Boolean(source.advisorName));
}

const parseSearchRow = (
  row: cheerio.Cheerio<AnyNode>,
  sourceUrl: string
): WellsFargoBranchSource | null => {
  const cells = row.find("td.tableData");
  if (cells.length < 3) return null;
  const addressCell = cells.eq(0);
  const contactCell = cells.eq(2);
  const lines = cleanLines(addressCell.text()).filter(
    line => line !== "Map and Directions"
  );
  const rawName = cleanText(addressCell.find("strong").first().text());
  const name = rawName.replace(/^\d+\.\s*/u, "");
  if (!name) return null;
  const parsedAddress = parseAddressLines(
    lines.filter(line => !line.startsWith(rawName))
  );
  return {
    name,
    branchUrl: absoluteUrl(
      addressCell.find("strong a").attr("href"),
      sourceUrl
    ),
    ...parsedAddress,
    ...parseContact(contactCell.text()),
  };
};

const parseAddressLines = (
  lines: ReadonlyArray<string>
): Partial<WellsFargoBranchSource> => {
  const cityIndex = lines.findIndex(
    (line, index) =>
      line.endsWith(",") &&
      STATE_RE.test(lines[index + 1] ?? "") &&
      ZIP_RE.test(lines[index + 2] ?? "")
  );
  if (cityIndex < 0) return {};
  const addressLines = lines.slice(0, cityIndex);
  return {
    address: addressLines.at(-1),
    city: lines[cityIndex]?.replace(/,$/u, ""),
    state: lines[cityIndex + 1],
    postalCode: lines[cityIndex + 2],
  };
};

const parseContact = (value: string): Partial<WellsFargoBranchSource> => ({
  phone: normalizePhone(matchContact(value, "Phone")),
  tollFree: normalizePhone(matchContact(value, "Toll Free")),
  fax: normalizePhone(matchContact(value, "Fax")),
});

const matchContact = (value: string, label: string): string | undefined => {
  const match = new RegExp(`${label}:\\s*([^\\n]+)`, "u").exec(value);
  return match ? cleanText(match[1]) : undefined;
};

const branchVariables = (html: string): Partial<WellsFargoBranchSource> => {
  const address = [
    variableValue(html, "branchAddress1"),
    variableValue(html, "branchAddress3"),
  ]
    .filter(Boolean)
    .join(", ");
  return Object.fromEntries(
    Object.entries({
      name: variableValue(html, "branchName"),
      address,
      city: variableValue(html, "branchCity"),
      state: variableValue(html, "branchState"),
      postalCode: variableValue(html, "branchZip"),
      branchCode: variableValue(html, "branchCode"),
      subfirm: variableValue(html, "subfirm"),
      phone: normalizePhone(variableValue(html, "phone")),
      tollFree: normalizePhone(variableValue(html, "tollFree")),
      fax: normalizePhone(variableValue(html, "fax")),
    }).filter(([, value]) => Boolean(value))
  );
};

const variableValue = (html: string, name: string): string | undefined => {
  const match = new RegExp(`var\\s+${name}\\s*=\\s*["']([^"']*)["']`, "u").exec(
    html
  );
  return match ? cleanText(match[1]) : undefined;
};

const absoluteUrl = (
  href: string | undefined,
  base: string
): string | undefined => {
  if (!href) return undefined;
  return normalizeUrl(new URL(href.replaceAll("&#58;", ":"), base).toString());
};

const cleanLines = (value: string): ReadonlyArray<string> =>
  value.split(/\n/u).map(cleanText).filter(Boolean);
