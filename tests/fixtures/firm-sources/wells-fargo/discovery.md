# Wells Fargo Advisors Discovery

- Locator page: `https://www.wellsfargo.com/locator/wellsfargoadvisors/`
- Search page: `https://www.wellsfargo.com/locator/wellsfargoadvisors/search`
- Bounded ZIP query used during discovery:
  `?zip5=10022&chkWFA=001&chkFNet=072&chkBIS=020`
- Result shape: server-rendered HTML table with 25 location rows per page.
- Advisor source: some location rows link to
  `https://home.wellsfargoadvisors.com/<branch-code>` branch pages. Those
  branch pages expose an `Our Financial Advisors` HTML list.
- Limitation: no public JSON advisor feed was observed. Locator-only rows are
  branch/location records and do not identify advisors, so the scraper only
  emits advisor rows from linked branch profile pages.
