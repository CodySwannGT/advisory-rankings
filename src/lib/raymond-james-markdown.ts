import { cleanText } from "./morgan-stanley-row-utils.js";
import type {
  RaymondJamesAdvisorSource,
  RaymondJamesBranchSource,
} from "./raymond-james-types.js";

const ROLE_TITLES = [
  "Senior Branch Operations Manager",
  "Senior Investment Portfolio Analyst",
  "Senior Vice President, Wealth Management",
  "Vice President - Wealth Management",
  "Financial Planning Consultant",
  "Complex Administrative Manager",
  "New York City Complex Manager",
  "International Wealth Advisor",
  "Investment Portfolio Associate",
  "Financial Advisor Trainee",
  "Practice Business Manager",
  "Financial Advisor",
  "Managing Director",
  "First Vice President",
  "Branch Manager",
] as const;

const branchTitlePattern =
  /^#\s{1,10}([^\n]{1,200}?)\s{1,10}of Raymond James/im;
const branchContactPattern =
  /\*\s{1,10}Raymond James Financial\s{1,10}([^\n[]{1,500})\[T:\s{0,10}([^\]]{1,50})\]/u;
const advisorEmailPattern = /mailto:([^)]{1,200})/iu;
const advisorPhonePattern = /tel:([^)]{1,50})/iu;
const addressPattern =
  /^(.{1,500}),\s{1,10}([A-Z]{2})\s{1,10}(\d{5}(?:-\d{4})?)$/u;
const credentialSuffixPattern = /\s{1,10}(CFP®|CFA®|AAMS™|CPWA®)$/u;

/**
 * Parses a Raymond James branch roster markdown document.
 * @param markdown - Markdown rendered from the public branch page.
 * @param branchUrl - Canonical branch page URL.
 * @returns Advisor source rows with branch metadata attached.
 */
export function parseRaymondJamesBranchMarkdown(
  markdown: string,
  branchUrl: string
): ReadonlyArray<RaymondJamesAdvisorSource> {
  const branch = parseRaymondJamesBranch(markdown, branchUrl);
  return [...markdown.matchAll(advisorLinkPattern())].map(match =>
    advisorSource(match, branch)
  );
}

/**
 * Parses branch metadata from a Raymond James branch markdown document.
 * @param markdown - Markdown rendered from the public branch page.
 * @param branchUrl - Canonical branch page URL.
 * @returns Branch source metadata.
 */
export function parseRaymondJamesBranch(
  markdown: string,
  branchUrl: string
): RaymondJamesBranchSource {
  const title = branchTitlePattern.exec(markdown)?.[1];
  const contact = branchContactPattern.exec(markdown);
  const address = parseAddress(cleanText(contact?.[1] ?? ""));
  return {
    name: cleanText(title ?? "Raymond James Branch"),
    branchUrl,
    address: address.address,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    phone: normalizePhone(contact?.[2]),
  };
}

const advisorLinkPattern = (): RegExp =>
  /\[!\[Image \d+(?:: [^\]]*)?\]\(([^)]+)\) ([^\]]+?) View Website\]\(([^)]+)\)\n\n((?:\[\]\([^)]+\))*)/gu;

const advisorSource = (
  match: RegExpMatchArray,
  branch: RaymondJamesBranchSource
): RaymondJamesAdvisorSource => {
  const parsed = parseNameAndRole(cleanText(match[2] ?? ""));
  const contact = match[4] ?? "";
  return {
    advisorName: parsed.name,
    roleTitle: parsed.roleTitle,
    advisorUrl: absoluteRaymondJamesUrl(match[3] ?? ""),
    headshotUrl: absoluteRaymondJamesUrl(match[1] ?? ""),
    businessEmail: advisorEmailPattern.exec(contact)?.[1],
    businessPhone: normalizePhone(advisorPhonePattern.exec(contact)?.[1]),
    branch,
  };
};

/** Parsed advisor name and optional role title extracted from a Raymond James branch listing. */
interface NameAndRole {
  readonly name: string;
  readonly roleTitle?: string;
}

/** Address fields parsed from a Raymond James branch contact line. */
interface ParsedAddress {
  readonly address?: string;
  readonly city?: string;
  readonly state?: string;
  readonly postalCode?: string;
}

const parseNameAndRole = (value: string): NameAndRole => {
  const roleTitle = ROLE_TITLES.find(role => value.includes(role));
  if (!roleTitle) return { name: dedupeTrailingWords(value) };
  const name = value.slice(0, value.indexOf(roleTitle));
  return { name: dedupeTrailingWords(name), roleTitle };
};

const parseAddress = (value: string): ParsedAddress => {
  const match = addressPattern.exec(value);
  if (!match) return {};
  const beforeState = cleanText(match[1] ?? "");
  const city = cityFromAddressPrefix(beforeState);
  return {
    address: cleanText(beforeState.slice(0, -city.length)),
    city,
    state: match[2],
    postalCode: match[3],
  };
};

const dedupeTrailingWords = (value: string): string => {
  const words = cleanText(value).split(" ").filter(Boolean);
  return trimTrailingDuplicates(words)
    .join(" ")
    .replace(credentialSuffixPattern, ", $1")
    .replace(/,,/gu, ",");
};

const trimTrailingDuplicates = (
  words: ReadonlyArray<string>
): ReadonlyArray<string> => {
  if (words.length <= 1) return words;
  const last = words.at(-1);
  const previous = words.at(-2);
  if (!last || last !== previous) return words;
  return trimTrailingDuplicates(words.slice(0, -1));
};

const cityFromAddressPrefix = (value: string): string => {
  for (const city of ["New York", "Los Angeles", "San Francisco"]) {
    if (value.endsWith(` ${city}`)) return city;
  }
  return value.split(" ").at(-1) ?? "";
};

const normalizePhone = (value?: string): string | undefined => {
  const digits = value?.replace(/\D/gu, "");
  return digits || undefined;
};

const absoluteRaymondJamesUrl = (value: string): string | undefined => {
  if (!value) return undefined;
  return value.startsWith("http")
    ? value
    : `https://www.raymondjames.com${value.startsWith("/") ? "" : "/"}${value}`;
};
