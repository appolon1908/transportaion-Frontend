# PR #9 review repairs

Source-only follow-through for review 5125997249 on head
`a3168146292b9999b6ac9d8918f8d40f055a98bf`.

- Carrier settlement `total_minor` is converted from the API's hundredths before
  currency formatting. Tender `rate` remains in major units.
- Both tracking input initialization and reset use local wall-clock fields. The
  existing submission converts the selected local time to a UTC ISO timestamp.
- Organization selection fetches candidate context without replacing the current
  selection. HTTP/network/invalid-response/revoked-membership/storage failures
  leave the prior selection and context intact. A per-store revision prevents
  superseded context requests or late post-logout responses from committing.
  The shell reports failures, restores the native selector and unmounts old
  portal actions during a switch; the selected organization keys its new view.

## Regression evidence

`npm test` includes `tests/organization_switch.test.ts` (real Pinia with mocked
HTTP/OIDC) and `tests/portal_presentation.test.ts` (currency, four independently
spawned process time zones, and source wiring). January and July UTC instants
exercise negative, positive and fractional offsets at minute precision. This
is not an assertion that ambiguous daylight-saving fall-back wall times encode
an explicit offset; datetime-local retains the browser's standard interpretation.

Required before merge: current-head/merge-result CI, existing portal production
typecheck/build and mocked browser workflow, and eligible independent review.
The restricted local environment ran 18 smoke cases using actual store actions
with a minimal Pinia stub plus real date/currency helpers; it did not run a full
Vue/Pinia build. GitHub CI is the authoritative full-dependency validation.

No dependency pins, permissions, backend authorization, external-delivery flags,
provider configuration, credentials, deployment manifests or runtime changed.
Neither prior integration history nor foundation documentation was removed.
