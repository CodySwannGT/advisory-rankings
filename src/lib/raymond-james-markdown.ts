// @ts-nocheck
/* eslint-disable sonarjs/prefer-regexp-exec, sonarjs/slow-regex -- branch roster markdown parsing is bounded to one public page at a time. */
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
  const title = markdown.match(/^#\s+(.+?)\s+of Raymond James/im)?.[1];
  const contact = markdown.match(
    /\*\s+Raymond James Financial\s+([^\n[]+)\[T:\s*([^\]]+)\]/u
  );
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
    businessEmail: contact.match(/mailto:([^)]+)/iu)?.[1],
    businessPhone: normalizePhone(contact.match(/tel:([^)]+)/iu)?.[1]),
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
  const match = value.match(/^(.+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/u);
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
    .replace(/\s+(CFP®|CFA®|AAMS™|CPWA®)$/u, ", $1")
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

/* eslint-enable sonarjs/prefer-regexp-exec, sonarjs/slow-regex -- re-enable global parser lint rules after this bounded markdown parser. */
