import type { YextAddress } from "./morgan-stanley-types.js";

const CERTIFICATION_CODE_RE = /[A-Z]{2,6}/u;
const NON_ALPHANUMERIC_RE = /[^A-Za-z0-9]+/gu;
const PHONE_DIGIT_RE = /\D/gu;
const WHITESPACE_RE = /\s+/gu;

export const cleanText = (value: string): string =>
  value.replace(WHITESPACE_RE, " ").trim();

export const splitName = (
  legalName: string
): Record<string, string | undefined> => {
  const parts = legalName.split(WHITESPACE_RE).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : undefined,
    lastName: parts.at(-1),
  };
};

export const certificationCode = (value: string): string => {
  const first = CERTIFICATION_CODE_RE.exec(value)?.[0];
  const fallback = trimUnderscores(
    cleanText(value).replace(NON_ALPHANUMERIC_RE, "_")
  );
  return first ?? (fallback || "other");
};

export const listNote = (
  label: string,
  values?: ReadonlyArray<string>
): string | undefined => {
  return values?.length ? `${label}: ${values.join(", ")}` : undefined;
};

export const normalizePhone = (value?: string): string | undefined => {
  if (!value) return undefined;
  return value.startsWith("+") ? value : value.replace(PHONE_DIGIT_RE, "");
};

export const normalizeUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  return value.startsWith("http://")
    ? `https://${value.slice("http://".length)}`
    : value;
};

export const addressKey = (address: YextAddress): string => {
  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(":");
};

export const withoutEmpty = (
  row: Record<string, unknown>
): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) =>
      Array.isArray(value)
        ? value.length > 0
        : value !== undefined && value !== null && value !== ""
    )
  );
};

export const uniqueRows = (
  rows: ReadonlyArray<Record<string, unknown>>
): ReadonlyArray<Record<string, unknown>> => {
  return [...new Map(rows.map(row => [String(row.id), row])).values()];
};

const trimUnderscores = (value: string): string => {
  const withoutLeading = value.startsWith("_")
    ? trimUnderscores(value.slice(1))
    : value;
  return withoutLeading.endsWith("_")
    ? trimUnderscores(withoutLeading.slice(0, -1))
    : withoutLeading;
};
