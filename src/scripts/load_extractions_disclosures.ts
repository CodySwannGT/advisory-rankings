import { disclosureId, uid } from "../lib/ids.js";
import {
  advisorLookup,
  asRecord,
  extractionRows,
  stringValue,
  type LookupPair,
  type Row,
} from "./load_extractions_helpers.js";

/**
 *
 */
interface LoadContext {
  readonly aid: string;
  readonly advisorPairs: ReadonlyArray<LookupPair>;
}

export const disclosureRows = (ex: Row, context: LoadContext) => {
  const disclosures = extractionRows(ex.disclosures).map(disclosure =>
    disclosureRow(disclosure, context)
  );
  return {
    Disclosure: disclosures,
    ArticleDisclosureMention: disclosures.map(row => ({
      id: uid(`adm:${context.aid}:${row.id}`),
      articleId: context.aid,
      disclosureId: row.id,
    })),
  };
};

export const disclosureIdForLocal = (
  ex: Row,
  context: LoadContext,
  localKey: string
): string | null => {
  const disclosure = extractionRows(ex.disclosures).find(
    row => row.local_key === localKey
  );
  return disclosure ? stringValue(disclosureRow(disclosure, context).id) : null;
};

const disclosureRow = (disclosure: Row, context: LoadContext): Row => {
  const advisor = advisorLookup(
    context.advisorPairs,
    stringValue(disclosure.advisor_legal_name)
  );
  const fields = asRecord(disclosure.fields);
  const naturalKey = asRecord(disclosure.natural_key);
  return {
    id: disclosureId(
      advisor,
      stringValue(fields.disclosureType ?? naturalKey.disclosure_type),
      stringValue(fields.dateInitiated ?? fields.dateResolved),
      stringValue(fields.regulator ?? naturalKey.regulator)
    ),
    advisorId: advisor,
    localKey: disclosure.local_key,
    ...fields,
  };
};
