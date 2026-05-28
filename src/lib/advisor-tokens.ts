/**
 * Cap on emitted tokens per advisor. Observed name cardinality is < 8;
 * this is a defensive floor against pathological inputs.
 */
export const MAX_TOKENS_PER_ADVISOR = 32;

/**
 *
 */
export type TokenKind =
  | "name"
  | "firstName"
  | "lastName"
  | "preferredName"
  | "alias";

/**
 *
 */
export interface AdvisorToken {
  readonly token: string;
  readonly kind: TokenKind;
}

/**
 *
 */
export interface AdvisorRow {
  readonly id: string;
  readonly legalName: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly preferredName?: string | null;
}

/**
 * Normalizes a free-text fragment to the same lowercased ASCII-folded form
 * used by both the write-side tokenizer and the read-side query parser.
 * @param input - Raw text fragment.
 * @returns NFD-folded, lowercased, trimmed form.
 */
export function normalizeQueryToken(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Splits a normalized name fragment into its constituent tokens, applying
 * the same length floor (>= 2) the existing /Search resource enforces so
 * write-side index entries and read-side query tokens always align.
 * @param input - Raw text fragment (will be normalized before splitting).
 * @returns Tokens with length >= 2, in source order.
 */
export function splitQueryTokens(input: string): readonly string[] {
  const normalized = normalizeQueryToken(input);
  if (!normalized) return [];
  return normalized.split(/[\s.,'-]+/u).filter(t => t.length >= 2);
}

/**
 * Kind precedence: when the same token surfaces under multiple roles for
 * a single advisor, the most specific role wins. `name` is the strongest
 * (it carries the exact-equals score-3 tier in /Search), `preferredName`
 * the weakest (nicknames bias too hard if they outrank legal-name parts).
 */
const KIND_RANK: Readonly<Record<TokenKind, number>> = {
  name: 4,
  lastName: 3,
  firstName: 2,
  preferredName: 1,
  alias: 0,
};

const isStronger = (next: TokenKind, current: TokenKind): boolean =>
  KIND_RANK[next] > KIND_RANK[current];

const addToken = (
  acc: ReadonlyMap<string, TokenKind>,
  token: string,
  kind: TokenKind
): ReadonlyMap<string, TokenKind> => {
  if (!token) return acc;
  const existing = acc.get(token);
  if (existing && !isStronger(kind, existing)) return acc;
  return new Map([...acc, [token, kind]]);
};

const addAll = (
  acc: ReadonlyMap<string, TokenKind>,
  tokens: readonly string[],
  pickKind: (token: string) => TokenKind
): ReadonlyMap<string, TokenKind> =>
  tokens.reduce(
    (current, token) => addToken(current, token, pickKind(token)),
    acc
  );

const stringOrEmpty = (value: string | null | undefined): string =>
  typeof value === "string" ? value : "";

const uniqueOrdered = (tokens: readonly string[]): readonly string[] =>
  tokens.reduce<readonly string[]>(
    (acc, t) => (acc.includes(t) ? acc : [...acc, t]),
    []
  );

/**
 * Builds the canonical token set for one advisor row. Pure function of
 * the row's name fields — no IO, no clocks, no randomness — so re-running
 * with the same input produces the same output, which the diff-based
 * reindex relies on to stay idempotent.
 * @param row - Advisor row with name fields.
 * @returns Token set, capped at MAX_TOKENS_PER_ADVISOR.
 */
export function tokensForAdvisor(row: AdvisorRow): readonly AdvisorToken[] {
  const legalName = stringOrEmpty(row.legalName);
  const firstName = stringOrEmpty(row.firstName);
  const lastName = stringOrEmpty(row.lastName);
  const preferredName = stringOrEmpty(row.preferredName);

  const fullName = normalizeQueryToken(legalName);
  const legalParts = splitQueryTokens(legalName);
  const firstParts = splitQueryTokens(firstName);
  const lastParts = splitQueryTokens(lastName);
  const preferredParts = splitQueryTokens(preferredName);

  const lastSet: ReadonlySet<string> = new Set(lastParts);
  const firstSet: ReadonlySet<string> = new Set(firstParts);
  const preferredSet: ReadonlySet<string> = new Set(preferredParts);

  // Classify a single-word token by the most-specific source it appears in.
  // lastName > firstName > preferredName > name. The full normalized
  // legalName is added separately as kind=name; precedence (name > lastName)
  // applies so an exact-equals match on the legal name (e.g. user types
  // the whole name) wins the score-3 tier in /Search.
  const classify = (token: string): TokenKind => {
    if (lastSet.has(token)) return "lastName";
    if (firstSet.has(token)) return "firstName";
    if (preferredSet.has(token)) return "preferredName";
    return "name";
  };

  const allSingles = uniqueOrdered([
    ...legalParts,
    ...firstParts,
    ...lastParts,
    ...preferredParts,
  ]);

  const seeded: ReadonlyMap<string, TokenKind> = new Map();
  const withSingles = addAll(seeded, allSingles, classify);
  const finalMap = fullName
    ? addToken(withSingles, fullName, "name")
    : withSingles;

  return [...finalMap.entries()]
    .slice(0, MAX_TOKENS_PER_ADVISOR)
    .map(([token, kind]) => ({ token, kind }));
}
