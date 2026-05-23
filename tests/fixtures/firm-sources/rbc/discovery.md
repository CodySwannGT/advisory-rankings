# RBC Wealth Management Discovery

- Locator page: `https://www.rbcwealthmanagement.com/en-us/find-an-advisor`
- AJAX endpoint:
  `https://www.rbcwealthmanagement.com/en-us/wp-admin/admin-ajax.php`
- Branch action:
  `action=rbcwm_get_advisors_branches&nonce=<page nonce>&location_string=10022&data_source=us`
- Advisor action:
  `action=rbcwm_get_advisors_by_branch&nonce=<page nonce>&branch_id=<id>&data_source=us`
- Result shape: successful AJAX responses are JSON envelopes containing HTML
  fragments in `data.html`.
- Limitation: the feed is not structured JSON; parser tests cover the HTML
  fragments used for branch and advisor normalization.
