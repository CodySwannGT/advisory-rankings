const BROKERCHECK_FETCHED_AT = "2026-05-30T00:00:00.000Z";

/**
 * Builds one found advisor comparison item.
 * @param id - Advisor id.
 * @param index - Display index.
 * @returns Found comparison item.
 */
export function comparisonItem(id: string, index: number): unknown {
  const featured = featuredComparisonDetails(index);
  return {
    id,
    status: "found",
    displayName: `Advisor ${index + 1}`,
    identity: { careerStatus: "active", yearsExperience: 10 + index },
    firm: { name: `Firm ${index + 1}` },
    regulatory: {
      disclosureCount: 0,
      disclosures: [],
      registrationApplications: [],
      brokerCheckSnapshot: featured.brokerCheck,
    },
    career: featured.career,
    rankings: featured.rankings,
    articles: featured.articles,
    dataConfidence: {
      confidenceSummary: featured.confidenceSummary,
      evidenceFreshness: featured.evidenceFreshness,
    },
    attribution: {
      brokerCheck: featured.brokerCheck,
      articles: featured.articles,
      assertions: featured.assertions,
      researchSources: featured.researchSources,
    },
  };
}

function featuredComparisonDetails(index: number): Record<string, unknown> {
  if (index !== 0) {
    return emptyComparisonDetails();
  }

  const firmName = `Firm ${index + 1}`;
  return {
    brokerCheck: { subjectCrd: 1000, fetchedAt: BROKERCHECK_FETCHED_AT },
    career: [
      {
        firm: { name: firmName },
        roleTitle: "Managing director",
      },
    ],
    rankings: [
      {
        entry: {
          rank: 12,
          sourceLabel: "AdvisorBook fallback",
        },
        ranking: { name: "AdvisorBook 100" },
      },
    ],
    articles: [
      {
        title: "Advisor profile coverage",
        publishedDate: "2026-04-15T00:00:00.000Z",
        sourceLabel: "AdvisorHub",
      },
    ],
    confidenceSummary: {
      hasData: true,
      asserted: 1,
      inferred: 1,
      derived: 1,
      total: 3,
    },
    evidenceFreshness: {
      hasData: true,
      lastCheckedAt: "2026-05-31T00:00:00.000Z",
    },
    assertions: [
      {
        articleId: "article-1",
        fieldName: "firm",
        assertedValue: firmName,
        quotePhrase: "Firm 1",
        confidence: "high",
      },
    ],
    researchSources: brokerCheckResearchSources(),
  };
}

function brokerCheckResearchSources(): readonly Record<string, unknown>[] {
  return [
    {
      sourceType: "brokercheck",
      status: "checked",
      checkedAt: BROKERCHECK_FETCHED_AT,
      sourcesChecked: ["FINRA BrokerCheck"],
    },
  ];
}

function emptyComparisonDetails(): Record<string, unknown> {
  return {
    brokerCheck: null,
    career: [],
    rankings: [],
    articles: [],
    confidenceSummary: {
      hasData: false,
      asserted: 0,
      inferred: 0,
      derived: 0,
      total: 0,
    },
    evidenceFreshness: { hasData: false, lastCheckedAt: null },
    assertions: [],
    researchSources: [],
  };
}
