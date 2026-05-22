/**
 * Small number words BrokerCheck uses in sanction duration text.
 */
export const WORD_NUMBERS = new Map(
  Object.entries({
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    eighteen: 18,
    "twenty-four": 24,
  })
);

/**
 * State names BrokerCheck emits in regulator labels mapped to postal codes.
 */
export const STATE_NAME_TO_ABBR = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "puerto rico": "PR",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  "virgin islands": "VI",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
} as const;

/**
 * BrokerCheck disclosure labels mapped to local disclosure categories.
 */
export const DISCLOSURE_TYPE_MAP = {
  regulatory: "regulatory",
  "customer dispute": "customer_dispute",
  civil: "civil",
  criminal: "criminal",
  "judgment / lien": "judgment_lien",
  "judgment/lien": "judgment_lien",
  financial: "financial",
  "employment separation after allegations": "employment_separation",
  termination: "employment_separation",
  investigation: "investigation",
  bond: "bond",
  bankruptcy: "financial",
} as const;

/**
 * BrokerCheck sanction labels mapped to local sanction categories.
 */
export const SANCTION_MAP = {
  "civil and administrative penalty(ies)/fine(s)": "fine",
  "civil and administrative penalty/fine": "fine",
  fine: "fine",
  "monetary penalty other than fines": "fine",
  suspension: "suspension",
  bar: "bar",
  barred: "bar",
  censure: "censure",
  denial: "denial",
  undertaking: "undertaking",
  restitution: "restitution",
  disgorgement: "disgorgement",
  revocation: "revocation",
  "cease and desist": "cease_and_desist",
} as const;
