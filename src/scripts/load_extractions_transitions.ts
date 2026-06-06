import { teamId, uid } from "../lib/ids.js";
import {
  advisorLookup,
  asRecord,
  extractionRows,
  firmLookup,
  stringValue,
  uniqueById,
  type Row,
  type LookupPair,
} from "./load_extractions_helpers.js";

/**
 *
 */
interface LoadContext {
  readonly aid: string;
  readonly firmPairs: ReadonlyArray<LookupPair>;
  readonly advisorPairs: ReadonlyArray<LookupPair>;
}

export const transitionSourceRows = (ex: Row): ReadonlyArray<Row> => [
  ...extractionRows(ex.transition_events),
  ...extractionRows(ex.transitions),
];

export const transitionRows = (ex: Row, context: LoadContext) => {
  const rows = transitionSourceRows(ex)
    .map(transition => transitionRow(transition, context))
    .filter((row): row is Row => row !== null);
  return {
    TransitionEvent: uniqueById(rows),
    ArticleTransitionEventMention: uniqueById(
      rows.map(row => ({
        id: uid(`atem:${context.aid}:${row.id}`),
        articleId: context.aid,
        transitionEventId: row.id,
      }))
    ),
  };
};

export const transitionIdForLocal = (
  ex: Row,
  context: LoadContext,
  localKey: string
): string | null => {
  const transition = transitionSourceRows(ex).find(
    row => row.local_key === localKey
  );
  if (!transition) return null;
  const fields = asRecord(transition.fields);
  const fromFirmName = transitionFirmName(transition, fields, "from");
  const toFirmName = transitionFirmName(transition, fields, "to");
  if (!fromFirmName || !toFirmName) return null;
  return transitionId(transition, context, fromFirmName, toFirmName);
};

export const skippedTransitionAssertionRows = (
  ex: Row,
  context: LoadContext
): ReadonlyArray<Row> =>
  transitionSourceRows(ex).flatMap(transition => {
    const skipReason = transitionSkipReason(transition, context);
    if (!skipReason) return [];
    const localKey = stringValue(transition.local_key);
    const targetId = uid(
      `te-skip:${context.aid}:${localKey || JSON.stringify(transition)}`
    );
    return [
      {
        id: uid(`fa:${context.aid}:TransitionEventExtractionSkip:${targetId}`),
        articleId: context.aid,
        targetTable: "TransitionEventExtractionSkip",
        targetId,
        fieldName: "skipReason",
        assertedValue: JSON.stringify(skipReason),
        confidence: "derived",
      },
    ];
  });

const transitionRow = (transition: Row, context: LoadContext): Row | null => {
  const fields = asRecord(transition.fields);
  const fromFirmName = transitionFirmName(transition, fields, "from");
  const toFirmName = transitionFirmName(transition, fields, "to");
  const subject = transitionSubject(transition, context);
  if (!fromFirmName || !toFirmName || !subject) return null;
  return {
    id: transitionId(transition, context, fromFirmName, toFirmName),
    ...subject,
    fromFirmId: firmLookup(context.firmPairs, fromFirmName),
    toFirmId: firmLookup(context.firmPairs, toFirmName),
    ...transitionFields(fields),
  };
};

const transitionFirmName = (
  transition: Row,
  fields: Row,
  side: "from" | "to"
): string =>
  side === "from"
    ? stringValue(transition.from_firm_canonical_name ?? fields.fromFirm)
    : stringValue(transition.to_firm_canonical_name ?? fields.toFirm);

const transitionSubject = (
  transition: Row,
  context: LoadContext
): Row | null => {
  const advisorNameRef = stringValue(transition.subject_advisor_legal_name);
  if (advisorNameRef)
    return {
      subjectAdvisorId: advisorLookup(context.advisorPairs, advisorNameRef),
    };
  const teamName = stringValue(transition.subject_team_name);
  if (teamName) {
    const teamFirmName = stringValue(
      transition.subject_team_firm_canonical_name ??
        transition.to_firm_canonical_name
    );
    return { subjectTeamId: teamId(teamName, teamFirmName) };
  }
  const firmName = stringValue(transition.subject_firm_canonical_name);
  return firmName
    ? { subjectFirmId: firmLookup(context.firmPairs, firmName) }
    : null;
};

const transitionFields = (fields: Row): Row =>
  Object.fromEntries(
    [
      "moveDate",
      "announcedDate",
      "aumMoved",
      "productionT12",
      "headcountMoved",
      "recruitingDealId",
      "isBreakaway",
      "isReturn",
      "notes",
    ].flatMap(key => (fields[key] === undefined ? [] : [[key, fields[key]]]))
  );

const transitionId = (
  transition: Row,
  context: LoadContext,
  fromFirmName: string,
  toFirmName: string
): string => {
  const localKey = stringValue(transition.local_key);
  if (localKey) return uid(`te:${context.aid}:${localKey}`);
  const fields = asRecord(transition.fields);
  return uid(
    [
      "te",
      context.aid,
      stringValue(transition.subject_advisor_legal_name),
      stringValue(transition.subject_team_name),
      stringValue(transition.subject_firm_canonical_name),
      fromFirmName,
      toFirmName,
      stringValue(fields.moveDate ?? fields.announcedDate),
    ].join(":")
  );
};

const transitionSkipReason = (
  transition: Row,
  context: LoadContext
): string | null => {
  const fields = asRecord(transition.fields);
  if (
    !transitionFirmName(transition, fields, "from") ||
    !transitionFirmName(transition, fields, "to")
  )
    return "missing_from_or_to_firm";
  return transitionSubject(transition, context) ? null : "missing_subject";
};
