import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

import {
  cleanText,
  normalizePhone,
  normalizeUrl,
} from "./morgan-stanley-row-utils.js";
import type { StifelAdvisorSource } from "./stifel-types.js";

const STIFEL_ORIGIN = "https://www.stifel.com";
const STATE_NAMES = new Map([
  ["alabama", "AL"],
  ["alaska", "AK"],
  ["arizona", "AZ"],
  ["arkansas", "AR"],
  ["california", "CA"],
  ["colorado", "CO"],
  ["connecticut", "CT"],
  ["delaware", "DE"],
  ["florida", "FL"],
  ["georgia", "GA"],
  ["hawaii", "HI"],
  ["idaho", "ID"],
  ["illinois", "IL"],
  ["indiana", "IN"],
  ["iowa", "IA"],
  ["kansas", "KS"],
  ["kentucky", "KY"],
  ["louisiana", "LA"],
  ["maine", "ME"],
  ["maryland", "MD"],
  ["massachusetts", "MA"],
  ["michigan", "MI"],
  ["minnesota", "MN"],
  ["mississippi", "MS"],
  ["missouri", "MO"],
  ["montana", "MT"],
  ["nebraska", "NE"],
  ["nevada", "NV"],
  ["new hampshire", "NH"],
  ["new jersey", "NJ"],
  ["new mexico", "NM"],
  ["new york", "NY"],
  ["north carolina", "NC"],
  ["north dakota", "ND"],
  ["ohio", "OH"],
  ["oklahoma", "OK"],
  ["oregon", "OR"],
  ["pennsylvania", "PA"],
  ["rhode island", "RI"],
  ["south carolina", "SC"],
  ["south dakota", "SD"],
  ["tennessee", "TN"],
  ["texas", "TX"],
  ["utah", "UT"],
  ["vermont", "VT"],
  ["virginia", "VA"],
  ["washington", "WA"],
  ["west virginia", "WV"],
  ["wisconsin", "WI"],
  ["wyoming", "WY"],
]);

/**
 * Parses Stifel advisor search-result HTML.
 * @param html - Search response HTML from stifel.com.
 * @param searchUrl - Source URL that returned the HTML.
 * @returns Normalized advisor listings found in the results table.
 */
export function parseStifelSearchResults(
  html: string,
  searchUrl: string
): ReadonlyArray<StifelAdvisorSource> {
  const $ = cheerio.load(html);
  return $("#searchResults tbody tr")
    .toArray()
    .map(row => parseAdvisor($, row, searchUrl))
    .filter((advisor): advisor is StifelAdvisorSource => Boolean(advisor));
}

const parseAdvisor = (
  $: cheerio.CheerioAPI,
  row: Element,
  searchUrl: string
): StifelAdvisorSource | null => {
  const root = $(row);
  const link = root.find(".search-results-fa-link").first();
  const advisorName = cleanText(link.text());
  if (!advisorName) return null;
  const contact = root.find(".search-results-contact-info");
  const emailButton = root.find(".search-results-email-image").first();
  const details = parseNameDetails($, root, advisorName);
  const location = parseLocation(details.location);
  const phones = contact
    .find(".search-results-phone-desktop")
    .toArray()
    .map(element => normalizePhone(cleanText($(element).text())));
  return {
    advisorName,
    advisorUrl: absoluteUrl(link.attr("href")),
    ...branchFields(contact),
    businessPhone: phones[0],
    city: location.city,
    emailContactName: cleanText(String(emailButton.data("fa-name") ?? "")),
    emailUrlFriendlyName: cleanText(
      String(emailButton.data("fa-url-friendly-name") ?? "")
    ),
    headshotUrl: absoluteUrl(root.find(".search-results-fa-image").attr("src")),
    linkedInUrl: normalizeUrl(
      root.find('a[href*="linkedin.com"]').first().attr("href")
    ),
    roleTitle: details.roleTitle,
    searchUrl,
    state: location.state,
    tollFreePhone: phones[1],
  };
};

const branchFields = (
  contact: cheerio.Cheerio<AnyNode>
): Pick<StifelAdvisorSource, "branchName" | "branchUrl"> => {
  const branchLink = contact.find(".search-results-branch-link");
  return {
    branchName: cleanText(branchLink.text()),
    branchUrl: absoluteUrl(branchLink.attr("href")),
  };
};

const parseNameDetails = (
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  advisorName: string
): Readonly<Record<"roleTitle" | "location", string | undefined>> => {
  const values = root
    .find(".search-results-name > div")
    .toArray()
    .map(element => cleanText($(element).text()))
    .filter(Boolean)
    .filter(value => value !== advisorName)
    .filter(value => !value.includes("Contact"))
    .filter(value => !value.includes("LinkedIn"));
  const [roleTitle, location] = values.filter(value => !value.includes("\n"));
  return { roleTitle, location };
};

const parseLocation = (
  value: string | undefined
): Partial<Pick<StifelAdvisorSource, "city" | "state">> => {
  const [city, stateName] = (value ?? "").split(",").map(cleanText);
  return {
    city,
    state: stateName
      ? (STATE_NAMES.get(stateName.toLowerCase()) ?? stateName)
      : undefined,
  };
};

const absoluteUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  return normalizeUrl(new URL(value, STIFEL_ORIGIN).toString());
};
