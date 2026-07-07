import { readFileSync } from "node:fs";

import { parse } from "yaml";

const ROLE_FILE = "harper-app/roles.yaml";
const CRUD_KEYS = ["read", "insert", "update", "delete"] as const;

/** CRUD permission booleans used by Harper table-level RBAC. */
interface TablePermission {
  readonly read: boolean;
  readonly insert: boolean;
  readonly update: boolean;
  readonly delete: boolean;
}

/** Normalized `permission` payload for one Harper role. */
interface NormalizedRolePermission {
  readonly super_user: boolean;
  readonly data: Readonly<RoleDataPermission>;
}

/** Normalized table grants under a Harper role's `data` permission. */
interface RoleDataPermission {
  readonly tables: Readonly<Record<string, TablePermission>>;
}

/** Parsed top-level shape of `harper-app/roles.yaml`. */
interface RoleFile {
  readonly app_user?: unknown;
}

/** Single role row returned by Harper `list_roles`. */
interface LiveRole {
  readonly role?: unknown;
  readonly id?: unknown;
  readonly permission?: unknown;
}

/**
 * Loads the committed `app_user` role from the Harper component role file.
 * @param path - Role YAML file path.
 * @returns Normalized role permission map.
 */
export function loadCommittedAppUserRole(
  path = ROLE_FILE
): NormalizedRolePermission {
  const parsed = parse(readFileSync(path, "utf8")) as RoleFile;
  return normalizeRolePermission(parsed.app_user);
}

/**
 * Extracts `app_user` from a live Harper `list_roles` response.
 * @param roles - Response body returned by `list_roles`.
 * @returns Normalized live role permission map.
 */
export function normalizeLiveAppUserRole(
  roles: unknown
): NormalizedRolePermission {
  if (!Array.isArray(roles))
    throw new Error("list_roles response is not an array");
  const appUser = roles.find(role => isAppUserRole(role));
  if (!appUser) throw new Error("list_roles response did not include app_user");
  return normalizeRolePermission(appUser.permission);
}

/**
 * Compares two normalized role maps for drift.
 * @param expected - Committed role map.
 * @param actual - Live role map.
 * @returns Human-readable drift lines.
 */
export function roleDrift(
  expected: NormalizedRolePermission,
  actual: NormalizedRolePermission
): ReadonlyArray<string> {
  const tableNames = sortedUnique([
    ...Object.keys(expected.data.tables),
    ...Object.keys(actual.data.tables),
  ]);
  const superUserDrift =
    expected.super_user === actual.super_user
      ? []
      : [
          `super_user expected ${String(expected.super_user)} but live is ${String(actual.super_user)}`,
        ];
  return [
    ...superUserDrift,
    ...tableNames.flatMap(tableName =>
      tableDrift(
        tableName,
        expected.data.tables[tableName],
        actual.data.tables[tableName]
      )
    ),
  ];
}

/**
 * Checks whether a live role row is the deployed app-user role.
 * @param value - Candidate `list_roles` row.
 * @returns True for the `app_user` role.
 */
function isAppUserRole(value: unknown): value is LiveRole {
  if (!isRecord(value)) return false;
  return value.role === "app_user" || value.id === "app_user";
}

/**
 * Normalizes either committed role YAML or live Harper role permissions.
 * @param value - Role permission object.
 * @returns Canonical role permission map.
 */
function normalizeRolePermission(value: unknown): NormalizedRolePermission {
  if (!isRecord(value)) throw new Error("role permission is not an object");
  const superUser = value.super_user === true;
  const data = isRecord(value.data) ? value.data : {};
  const rawTables = isRecord(data.tables) ? data.tables : data;
  return {
    super_user: superUser,
    data: {
      tables: normalizeTables(rawTables),
    },
  };
}

/**
 * Normalizes table permission maps and drops malformed entries.
 * @param tables - Raw table permission map.
 * @returns Stable table permission map.
 */
function normalizeTables(
  tables: Readonly<Record<string, unknown>>
): Readonly<Record<string, TablePermission>> {
  const entries = Object.entries(tables).flatMap(([table, permission]) =>
    isRecord(permission) ? [[table, normalizeTable(permission)] as const] : []
  );
  return Object.fromEntries(entries);
}

/**
 * Converts one table grant into explicit CRUD booleans.
 * @param permission - Raw table grant.
 * @returns Normalized table permission.
 */
function normalizeTable(
  permission: Readonly<Record<string, unknown>>
): TablePermission {
  return {
    read: permission.read === true,
    insert: permission.insert === true,
    update: permission.update === true,
    delete: permission.delete === true,
  };
}

/**
 * Computes drift lines for one table.
 * @param tableName - Table name.
 * @param expected - Committed permission.
 * @param actual - Live permission.
 * @returns Drift lines for the table.
 */
function tableDrift(
  tableName: string,
  expected: TablePermission | undefined,
  actual: TablePermission | undefined
): ReadonlyArray<string> {
  if (!expected) return [`unexpected live table grant: ${tableName}`];
  if (!actual) return [`missing live table grant: ${tableName}`];
  return CRUD_KEYS.flatMap(key =>
    expected[key] === actual[key]
      ? []
      : [
          `${tableName}.${key} expected ${String(expected[key])} but live is ${String(actual[key])}`,
        ]
  );
}

/**
 * Sorts and de-duplicates strings without mutating the input.
 * @param values - Values to sort.
 * @returns Sorted unique values.
 */
function sortedUnique(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)].sort(compareStrings);
}

/**
 * Locale-aware string comparator.
 * @param left - Left value.
 * @param right - Right value.
 * @returns Comparison result.
 */
function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

/**
 * Checks for a non-null object record.
 * @param value - Candidate value.
 * @returns True when the value is an object record.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}
