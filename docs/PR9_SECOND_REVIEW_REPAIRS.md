# PR #9 second-review repairs

Follow-through for review 5126075779 at bb0d171db4b1cd99a2ac398fc4fef349a1da4c57.

The Docker build now copies the existing lockfile before npm ci. Lifecycle
scripts are disabled consistently with portal CI, and .dockerignore prevents
local node_modules from overwriting the installed dependencies. Existing base
image tags and bundle targets are unchanged; this is not a claim of fully
reproducible or production-certified images.

The normalized organization collection accepts only an explicit ACTIVE status
(case-normalized). Suspended, revoked, invited, disabled, unknown and missing
statuses cannot be offered, auto-selected or selected. A stored selection that
is no longer active is cleared by the existing context-refresh path. Backend
membership authorization remains authoritative and unchanged.

Caller cancellation is checked before authentication, after token acquisition,
before dispatch and before unauthorized-response retry. The internal controller
inherits an already-aborted external signal even at late listener registration.
In-flight cancellation, timer/listener cleanup, idempotency keys and If-Match
headers are retained. Aborting after a request has reached a server does not
undo a server-side mutation and is not represented as rollback.

Reproduce with npm test, npm run typecheck:production, npm run build:production,
and the existing portal browser checks. New regression files cover 11 active
membership cases, 9 cancellation/retry cases and the Docker lock contract.
The maintenance container could not resolve github.com and could not install
the project dependencies; no local full-suite pass is claimed. Exact-head and
current-merge-result GitHub CI plus eligible review are still required.

No deployment, provider request, secret change, image publication, branch-rule
change or external-delivery activation is authorized by these source repairs.
