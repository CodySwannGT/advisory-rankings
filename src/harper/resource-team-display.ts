import type { TeamRow } from "../types/harper-schema.js";

const NON_COMPLIANT_SUFFIX = " - NON-COMPLIANT";

/**
 * Removes internal data-quality markers from public team names.
 * @param name - Stored Team.name value.
 * @returns Reader-facing team name.
 */
export function publicTeamDisplayName(name: unknown): string {
  const display = String(name ?? "").trim();
  return display.toUpperCase().endsWith(NON_COMPLIANT_SUFFIX)
    ? display.slice(0, -NON_COMPLIANT_SUFFIX.length).trim()
    : display;
}

/**
 * Rewrites a team row for public resources without mutating the stored row.
 * @param team - Team row loaded from Harper.
 * @returns Team row with a reader-facing `name`.
 */
export function publicTeamRow(team: TeamRow): TeamRow {
  const name = publicTeamDisplayName(team.name);
  return name === team.name ? team : { ...team, name };
}

/**
 * Canonical identity for duplicate public team rows.
 * @param team - Team row after public display-name cleanup.
 * @returns Stable directory identity key.
 */
export function publicTeamIdentityKey(team: TeamRow): string {
  return [
    publicTeamDisplayName(team.name).toLowerCase(),
    team.currentFirmId ?? team.id,
  ].join("\u0000");
}
