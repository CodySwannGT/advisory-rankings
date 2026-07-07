import { readFileSync } from "node:fs";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import {
  appUserRoleOperationPayload,
  loadCommittedAppUserRole,
  normalizeLiveAppUserRole,
  roleDrift,
} from "../src/lib/harper-role-map.js";

const PRIVATE_TABLES = [
  "AdvisorCorrectionRequest",
  "User",
  "UserRating",
  "UserWatchlist",
  "UserWatchlistEntry",
] as const;

const REQUIRED_CONFIG_EXTENSIONS = [
  "fastifyRoutes",
  "graphqlSchema",
  "jsResource",
  "rest",
  "roles",
  "static",
] as const;

function exportedTables(): readonly string[] {
  const schema = readFileSync("harper-app/schema.graphql", "utf8");
  return [...schema.matchAll(/^type (\w+) @table @export/gm)]
    .map(match => String(match[1]))
    .sort((a, b) => a.localeCompare(b));
}

describe("Harper app_user role map", () => {
  it("grants read-only access to every exported public table", () => {
    const role = loadCommittedAppUserRole();
    const tables = role.data.tables;

    expect(Object.keys(tables)).toEqual(exportedTables());
    expect(role.super_user).toBe(false);
    for (const permission of Object.values(tables)) {
      expect(permission).toEqual({
        read: true,
        insert: false,
        update: false,
        delete: false,
      });
    }
  });

  it("does not grant direct access to private user tables", () => {
    const tables = loadCommittedAppUserRole().data.tables;

    for (const table of PRIVATE_TABLES) expect(tables[table]).toBeUndefined();
  });

  it("builds the Harper role mutation payload required by deploy sync", () => {
    const payload = appUserRoleOperationPayload({
      super_user: false,
      data: {
        tables: {
          BranchCoverage: {
            read: true,
            insert: false,
            update: false,
            delete: false,
          },
        },
      },
    });

    expect(payload).toEqual({
      id: "app_user",
      role: "app_user",
      permission: {
        super_user: false,
        data: {
          tables: {
            BranchCoverage: {
              read: true,
              insert: false,
              update: false,
              delete: false,
              attribute_permissions: [],
            },
          },
        },
      },
    });
  });

  it("keeps roles configured with every deploy-required extension", () => {
    const config = parse(
      readFileSync("harper-app/config.yaml", "utf8")
    ) as Record<string, unknown>;

    for (const extension of REQUIRED_CONFIG_EXTENSIONS) {
      expect(config[extension], extension).toBeDefined();
    }
    expect(config.roles).toEqual({ files: "roles.yaml" });
  });

  it("reports drift when the live role diverges from the committed map", () => {
    const expected = loadCommittedAppUserRole();
    const actual = {
      ...expected,
      data: {
        tables: {
          ...expected.data.tables,
          Firm: { read: true, insert: true, update: false, delete: false },
        },
      },
    };

    expect(roleDrift(expected, actual)).toContain(
      "Firm.insert expected false but live is true"
    );
  });

  it("normalizes live list_roles responses and rejects malformed responses", () => {
    const role = normalizeLiveAppUserRole([
      {
        id: "app_user",
        permission: {
          super_user: false,
          data: {
            tables: {
              Firm: { read: true, insert: false, update: false, delete: false },
            },
          },
        },
      },
    ]);

    expect(role.data.tables.Firm).toEqual({
      read: true,
      insert: false,
      update: false,
      delete: false,
    });
    expect(() => normalizeLiveAppUserRole({})).toThrow(
      "list_roles response is not an array"
    );
    expect(() => normalizeLiveAppUserRole([])).toThrow(
      "list_roles response did not include app_user"
    );
    expect(() =>
      normalizeLiveAppUserRole([{ role: "app_user", permission: null }])
    ).toThrow("role permission is not an object");
  });

  it("normalizes direct data table maps and ignores malformed table grants", () => {
    const role = normalizeLiveAppUserRole([
      null,
      {
        role: "app_user",
        permission: {
          super_user: true,
          data: {
            Branch: { read: false },
            Firm: null,
          },
        },
      },
    ]);

    expect(role).toEqual({
      super_user: true,
      data: {
        tables: {
          Branch: { read: false, insert: false, update: false, delete: false },
        },
      },
    });
  });

  it("reports missing, unexpected, and super-user drift", () => {
    const expected = {
      super_user: false,
      data: {
        tables: {
          Advisor: { read: true, insert: false, update: false, delete: false },
          Firm: { read: true, insert: false, update: false, delete: false },
        },
      },
    };
    const actual = {
      super_user: true,
      data: {
        tables: {
          Article: { read: true, insert: false, update: false, delete: false },
          Firm: { read: false, insert: false, update: false, delete: false },
        },
      },
    };

    expect(roleDrift(expected, actual)).toEqual([
      "super_user expected false but live is true",
      "missing live table grant: Advisor",
      "unexpected live table grant: Article",
      "Firm.read expected true but live is false",
    ]);
  });
});
