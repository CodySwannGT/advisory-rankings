import { uid } from "./ids.js";
import type { AdvisorResearchCheck } from "./advisor-research-select.js";

export {
  selectDueAdvisors,
  type AdvisorResearchAdvisor,
  type AdvisorResearchCheck,
} from "./advisor-research-select.js";

/**
 * Convert a date to Harper's date-only representation.
 * @param value Date value to format.
 * @returns ISO date in YYYY-MM-DD form.
 */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Build an idempotent check row for one advisor/source/date.
 * @param input Check row input.
 * @param input.advisorId Advisor that was checked.
 * @param input.sourceType Source lane checked.
 * @param input.status Outcome status.
 * @param input.checkedAt Optional check date.
 * @param input.sourcesChecked Source URLs or snippets considered.
 * @param input.notes Short operator/agent notes.
 * @param input.nextCheckAfter Optional backoff date.
 * @returns Research check row ready for upsert.
 */
export function buildResearchCheck(
  input: Readonly<
    Record<"advisorId" | "sourceType" | "status", string> &
      Partial<
        Record<"checkedAt", string> &
          Record<"sourcesChecked", ReadonlyArray<string>> &
          Record<"notes", string> &
          Record<"nextCheckAfter", string>
      >
  >
): AdvisorResearchCheck {
  const checkedAt = input.checkedAt ?? dateOnly(new Date());
  return {
    id: uid(
      `research_check:${input.advisorId}:${input.sourceType}:${checkedAt}`
    ),
    advisorId: input.advisorId,
    sourceType: input.sourceType,
    checkedAt,
    status: input.status,
    sourcesChecked: input.sourcesChecked ?? [],
    notes: input.notes,
    nextCheckAfter: input.nextCheckAfter,
  };
}
