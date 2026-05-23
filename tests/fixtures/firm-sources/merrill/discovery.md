# Merrill / Bank of America Discovery

- Locator URL: `https://advisor.ml.com/search`
- Feed URL: `https://liveapi-cached.yext.com/v2/accounts/me/answers/vertical/query`
- Request: `experienceKey=merrill_answers`, `verticalKey=financial_professionals`,
  `version=PRODUCTION`, `locale=en`, `v=20240101`, plus `input`, `limit`, and
  `offset`.
- Pagination: offset/limit. Blank input returned more than 10,000 rows during
  discovery; ZIP/city inputs narrow the result set.
- Response fields used: `id`, `name`, `c_marketingName`, `c_advisorFirstName`,
  `c_advisorLastName`, `c_jobTitle`, `c_currentPositionStartDate`, `address`,
  `certifications`, `c_displayTeamName`, `c_profilePicture`, `emails`,
  `mainPhone`, and `c_pagesURL`.
- Blocked-source behavior: no block was observed for bounded JSON requests. The
  scraper raises a concise HTTP error body if the feed later blocks or changes.
