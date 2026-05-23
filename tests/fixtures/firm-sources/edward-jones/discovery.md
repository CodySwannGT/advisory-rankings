# Edward Jones Source Discovery

- Locator URL: `https://www.edwardjones.com/us-en/search/financial-advisor/results`
- Search form target:
  `https://www.edwardjones.com/us-en/search/find-a-financial-advisor?fasearch=10022&searchtype=2`
- Results API:
  `https://www.edwardjones.com/api/v3/financial-advisor/results`
- Required query parameters observed from the browser app: `q`, `distance`,
  `distance_unit`, `page`, `matchblock`, and `searchtype`.
- Optional query parameter: `pageSize`, used for map-sized requests and
  accepted for bounded scraper pages.
- Pagination fields: `currentPage`, `itemsPerPage`, `resultStartPoint`, and
  `resultCount`.
- Limitation: the locale-prefixed `/us-en/api/v3/...` path returned HTTP 401
  from curl. The root `/api/v3/...` endpoint worked with a browser-like
  `referer` from the search page.
