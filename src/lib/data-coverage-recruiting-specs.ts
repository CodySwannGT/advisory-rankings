/** SQL query spec for one recruiting coverage count. */
interface RecruitingCoverageSpec {
  readonly label: string;
  readonly sqlText: string;
}

/**
 * SQL snippets for each recruiting coverage count.
 * @returns Recruiting coverage query specs.
 */
export function recruitingCoverageSpecs(): ReadonlyArray<RecruitingCoverageSpec> {
  return [
    { label: "transition_events", sqlText: countSql("TransitionEvent") },
    {
      label: "article_transition_mentions",
      sqlText: countSql("ArticleTransitionEventMention"),
    },
    {
      label: "transition_field_assertions",
      sqlText:
        "SELECT COUNT(*) AS n FROM data.FieldAssertion WHERE targetTable = 'TransitionEvent'",
    },
  ];
}

const countSql = (table: string): string =>
  `SELECT COUNT(*) AS n FROM data.${table}`;
