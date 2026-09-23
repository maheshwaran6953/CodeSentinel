# Validation record

## Live External Validation

Checkpoint: 2026-09-21. Historical local results below remain separate from hosted validation.

| Integration | Current live status |
|---|---|
| GitHub | NOT VERIFIED LIVE — App exists; production OAuth, installation and webhook flow pending |
| Supabase | VERIFIED LIVE for TLS, database authentication, migration, nine application tables, constraints/indexes/RLS and migration rerun; confirmed faculty login/profile/session/dashboard verified using local application |
| Groq | VERIFIED LIVE for model discovery, commit-specific questions and structured grading with `openai/gpt-oss-20b`; persistence and score updates passed in isolated PostgreSQL; hosted student workflow pending |
| Upstash | VERIFIED LIVE — free database, verified TLS, PING, reconnect, BullMQ producer/worker, retry, deduplication and job persistence across producer restart |
| Render | VERIFIED LIVE for Docker build, migration-runner completion, NestJS startup and public HTTP 200 readiness (Supabase + Upstash); production AST/ML and browser E2E pending |
| Vercel | VERIFIED LIVE for Angular production deployment, login/direct-route HTML and generated API configuration at https://codesentinel-ochre.vercel.app; authenticated browser E2E pending |
| Browser E2E | PARTIAL — local frontend/backend faculty login with hosted Supabase passed; complete deployed student/commit/quiz/override workflow pending |

**FINAL PROJECT STATUS: NOT YET DEMO READY**

Current blockers: GitHub App URLs/deliveries and complete live E2E validation, including hosted quiz persistence.

Startup diagnosis: the existing 10-second PostgreSQL connection timeout was reproduced against the Supabase session pooler (one timeout, successful attempts at 9.9 and 6.6 seconds with verified TLS). Increased the connection timeout to 30 seconds without weakening TLS or statement limits. At that checkpoint, local Redis was independently unavailable; hosted Upstash resolved this on 2026-09-21. A failed bootstrap previously left Redis retry timers running because it only set process.exitCode; it now exits with status 1. The public Supabase CA is included in the Docker image and referenced by the Render configuration.

2026-09-18 checks after the minimal changes: backend build and 10 tests passed; Python 6 tests passed; frontend production build and 21 ChromeHeadless tests passed (headless browser required execution outside the Windows filesystem sandbox). The existing 510.98 kB bundle warning remains. Three TypeORM initialization checks passed, a full Nest startup passed with a 13-second database hook, and the normal server subsequently started successfully. One intervening startup still failed with the existing generic error; network stability should be monitored during hosted deployment. Redis was independently classified as ECONNREFUSED. Docker image rebuild could not run because the local Docker daemon is stopped. No hosted Redis, Groq or deployed-E2E success is claimed.

2026-09-21 external integration: stored the authorized Upstash TCP/TLS URL only in ignored `backend/.env`. A unique temporary validation queue passed TLS verification, reconnect, duplicate job handling, an intentional first-attempt failure followed by retry, and persistence across producer restart; only that test queue was removed afterward. `RUN_WORKER=true` is now configured; the backend started, `/health/ready` returned HTTP 200 with `ready`, and BullMQ reported one worker. No synthetic commit jobs were sent to the application queue.

Groq model discovery succeeded; `llama-3.3-70b-versatile` was absent from the account model list. `openai/gpt-oss-20b` produced three commit-specific questions and a valid structured grade through the unchanged Llm service. A separate isolated in-memory PostgreSQL run used real Groq calls through Analysis/QuizController: three questions and three grades persisted, the quiz completed, and one score-history update was recorded. Its local seed records were explicitly test data, not authorship evidence; no fixture records were written to hosted Supabase. An initial isolated run failed with sanitized output and no precise cause captured; rerunning with stage/status diagnostics passed with four HTTP 200 completions. This does not prove provider reliability or deployed E2E. Backend build/10 tests and all 6 Python tests passed again.

Deployment preparation: Render account is accessible. The blueprint selects the free plan explicitly, uses the existing migration runner in the Docker startup command because Render pre-deploy commands require paid compute, and selects the live-verified Groq model. No paid resource or billing change was authorized or performed.

Deferred secondary test: fresh non-allowlisted faculty login rejection is INCONCLUSIVE. Observed invalid-credentials responses occurred before the allowlist check, and later retries were interrupted by initialization failures. Normal saved allowlist restored; no persistent faculty role or Supabase user changed by this test. Do not repeat until the complete live flow works.

Security cleanup: exposed GitHub client-secret value was removed from the tracked template. Earlier local tracked-file/history inspection did not find that exact value in Git history; credential validity/rotation is not claimed here. No secret values are recorded in this document.

Validated locally on 2026-09-09 using Windows, Node 24.14.1, Python 3.12.14,
Chrome Headless 152, Docker PostgreSQL 16 and Redis 7. These results do not
assert that GitHub, Supabase-hosted services, Groq, Render or Vercel credentials
have been configured or live-provider calls have succeeded.

## Passing checks

| Check | Result |
|---|---|
| Backend dependency installation | Successful after aligning NestJS integration packages and ioredis peer range |
| `backend: npm run build` | Strict TypeScript compilation passes |
| `backend: npm test` | 10 tests pass, including real embedded PostgreSQL schema/service workflow |
| Python `unittest discover -s ml` | 6 tests pass: all supported grammars, structural features, invalid parsing, maturity, real XGBoost training/reload |
| PostgreSQL `npm run migrate` | Initial migration applied to local PostgreSQL; rerunning was a no-op |
| Real queue integration | Redis + BullMQ + PostgreSQL + real tree-sitter workflow passes; duplicate enqueue uses same job |
| NestJS HTTP integration | API reaches ready state; session lookup/logout, role separation, DTO rejection, CSRF Origin and 120 kB raw webhook signature checks pass |
| `frontend: npm run build` | Production build passes; about 511 kB initial JS/CSS, with a nonfatal 500 kB warning |
| `frontend: npm test -- --watch=false --browsers=ChromeHeadless` | 21 tests pass, including existing components and added API/guard contracts |
| `frontend: npm start` | Angular development server starts and compiles successfully |
| Lockfile contract | Both lockfiles match direct dependency manifests |
| `git diff --check` | No whitespace errors |

The service-workflow test creates ten chronological commits, extracts actual AST
features, establishes a personal baseline, flags a velocity deviation, generates
exactly one quiz through a **test-only** Groq fixture, persists answers/grades,
updates scores, and saves a faculty override retaining the original analysis.
It also verifies that retrying partial analysis retains completed quiz evidence.
The separate integration test routes this scenario through real BullMQ/Redis.
GitHub and Groq transport fixtures are confined to test files. No runtime demo mode,
fake prediction, mock login, or hardcoded dashboard data remains in application services.

## Diagnosed and repaired failures

- Original backend had no source/tsconfig and could not build.
- NestJS JWT/TypeORM integration majors and ioredis peer ranges conflicted.
- Original frontend style budget was below its existing linking stylesheet size;
  existing CSS was preserved and the component budget adjusted to 10/12 kB.
- Original Jasmine 7 prevented Zone.js patching; compatible Jasmine 5.6 and typings
  now run the existing Angular 19 test architecture.
- Router fixtures lacked state needed by real routerLink template directives;
  dashboard tests now use the Angular testing router.
- Windows sandbox blocked registry downloads and headless Chrome child processes;
  dependencies and browser tests ran with approved permissions.
- The configured Python package index lacked grammar distributions; public PyPI
  supplied the pinned Python 3.12 wheels.
- Windows reserved port 5432; local validation used `POSTGRES_PORT=15432`.
- Floating-point equality in a zero-distance assertion was corrected to a tolerant
  assertion; no computed scores were fabricated or rounded merely to satisfy a test.
- Analysis retry originally risked overwriting completed quiz contributions; it now
  reloads persisted quiz grades, covered by the workflow regression test.

## Dependency audit on the retained stack

- Backend production audit: **3 moderate**, no high or critical findings, remaining
  in the NestJS core/integration dependency chain. Available major fixes change
  the retained NestJS line. Unknown-path HTTP responses are sanitized by the API.
- Frontend production audit: **8 high** package findings in the retained Angular 19
  dependency chain. The reported fixes require a newer Angular major. No SSR,
  transfer cache, hydration or untrusted dynamic/i18n templates are enabled.
- Frontend full audit including developer tooling: **29 findings** (2 low, 5 moderate,
  22 high), after in-range fixes and patched archive/query/UUID overrides. Do not
  expose the development server to untrusted networks.

These counts are package advisory findings, not a determination that every exploit
path is reachable. They are also not a clean security audit. A supported-framework
upgrade should be reviewed before public production deployment.

## External integration readiness review — 2026-09-09

This follow-up was limited to the previously outstanding external validation items.
No application source, architecture, runtime dependencies, UI, migrations or deployment
configuration was changed. The checks did not demonstrate an application integration
defect requiring a patch. Temporary checks and generated credentials stayed in the
ignored `.cache` directory or disposable local containers; no runtime mocks were added.

**Environment inventory:** no actual backend/frontend `.env` files, Vercel project
link, provider credentials, or deployed frontend/backend URLs were available. The
relevant process variables for GitHub, Supabase, Groq, Redis/Upstash, Render and Vercel
were unset. Example files describe configuration; they do not configure an account.
No authenticated provider call or deployment is claimed below.

### Newly verified without provider credentials

| Check | Observed result and boundary |
|---|---|
| Render deployment image | `docker build --progress=plain -t codesentinel-validation:external ./backend` succeeds with the existing Dockerfile and lockfile. Linux image uses Node **22.23.2**, Python **3.11**, and the pinned AST/XGBoost packages. This is a local image build, not a Render deployment. |
| Container migration command | The image's `node dist/migrate.js` applies `001_initial.sql` to fresh, isolated PostgreSQL 16 over TLS; the second invocation has no pending migration. |
| Production image startup | Existing `CMD`, `NODE_ENV=production`, `RUN_WORKER=true` and `TRUST_PROXY=true` start NestJS as UID **1000**. `/health/ready` succeeds with real PostgreSQL and Redis dependencies. |
| PostgreSQL TLS | Actual TypeORM connection with `DATABASE_SSL=true` and a generated local CA establishes **TLS 1.3**, confirmed using `pg_stat_ssl`. The test does not verify Supabase's host, certificate chain, network restrictions or existing schema. |
| Redis TLS / BullMQ | Existing `rediss://` configuration connects to password-protected Redis 7 using a trusted test certificate. The client reports encrypted and authorized TLS. A real producer/worker completes a transport-test job, and repeat enqueue retains the same job ID. No hosted Upstash database was used. |
| Production OAuth entry and CORS | Actual HTTP responses redirect to GitHub with the configured client ID/callback and random state; state cookie has HttpOnly, Secure, SameSite=Lax and callback-path attributes. Invalid callback state redirects to the existing login error. Credentialed CORS preflights return only the configured frontend origin, including for a foreign-origin request. Real login/session cookies in a browser remain unverified. |
| Webhook in deployment image | Actual NestJS raw-body endpoint accepts a correctly signed **120 kB** ping with HTTP 202 and rejects a byte-modified payload with HTTP 401. It was sent locally, not by GitHub. |
| Linux AST/ML runtime | The non-root Node service launches the installed Python executable and extracts real AST features; no-history input returns no risk prediction. All **6 Python tests**, including real XGBoost training/reload on test-only styles, also pass inside the image. |
| Vercel production build asset | `npm run build` with `API_URL=https://api.codesentinel.example` passes and writes that exact origin into the built `config.js`. Both source and local built configuration were restored to the original `/api` development default afterward. The example domain was never contacted. |
| Vercel routing configuration | Local matching checks cover login, OAuth callback, all student pages and faculty cohort; JS/CSS/config assets are excluded from the SPA rewrite. This checks configured patterns and output files, not Vercel's live edge routing. |
| Provider schemas | `render.yaml` validates against Render's published schema. Configured Vercel fields validate against the corresponding fields of its published schema. The full live Vercel schema mixes draft versions in unrelated experimental fields, so a full-schema validation success is **not** claimed. |

The first TLS-container attempt failed because its generated private key was unreadable
by Redis's container user. Correcting permissions in the temporary test setup made the
checks pass; application code was unchanged. The earlier local test totals remain
historical results; unrelated application suites were not rerun in this follow-up.

### Provider configuration readiness

- **GitHub App/OAuth:** configured authorization/token endpoints, installation-token
  signing, user-token refresh fields and installation/repository API paths match the
  documented App flow. Use the App's **client ID** for OAuth and its **App ID/private
  key** for installation authentication. Actual IDs, keys, consent and repository
  permissions are still absent. [GitHub App user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app),
  [token renewal](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens).
- **GitHub webhooks:** raw HMAC-SHA256 verification matches GitHub's documented
  `X-Hub-Signature-256` contract. The existing route is `/webhooks/github`; an App
  webhook must be configured to reach it publicly. Local signature success does not
  establish public delivery or App event subscriptions.
  [GitHub delivery validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).
- **Supabase:** use the project's direct PostgreSQL connection when reachable, or
  its **session pooler on port 5432** for an IPv4-only persistent backend. Supply
  `DATABASE_SSL=true`; mount the provider CA and set `DATABASE_CA_FILE` if required
  by its certificate chain. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and a confirmed,
  allowlisted Auth user are separately required for faculty login.
  [Connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres),
  [SSL verification](https://supabase.com/docs/guides/platform/ssl-enforcement).
- **Groq:** the existing chat-completions request uses documented JSON object mode
  with explicit JSON instructions and application-side validation. The current
  catalog still lists `llama-3.3-70b-versatile`, but labels it **Enterprise / Contact
  Sales**. Do not assume a free/developer account has access. The configured model
  was preserved; account permission, quota and an actual completion must be checked.
  [Current model catalog](https://console.groq.com/docs/models),
  [JSON output requirements](https://console.groq.com/docs/structured-outputs#json-object-mode).
- **Render:** `rootDir: backend` makes the existing `./Dockerfile` and build context
  relative to `backend`; these paths require no fix. The Blueprint includes secret
  prompts, migrations and readiness checks. Its pre-deploy migration command
  requires a **paid web service**; choose the account's service plan deliberately.
  Real deployment, resource sizing, networking and domain configuration remain open.
  [Monorepo path rules](https://render.com/docs/monorepo-support),
  [pre-deploy requirements](https://render.com/docs/deploys#pre-deploy-command),
  [Blueprint schema](https://render.com/schema/render.yaml.json).
- **Vercel:** select root directory `frontend`, use the existing build/output
  settings, and set `API_URL` to the public HTTPS backend origin in the intended
  deployment environment. The default `/api` is for the local Angular proxy; no
  deployed backend proxy is configured in `vercel.json`. Choose Node 22 for alignment
  with the backend image. [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json).
- **Upstash Redis:** `REDIS_URL` must be the Redis **TCP/TLS** URL, e.g.
  `rediss://default:ENCODED_PASSWORD@HOST:6379`, not the REST URL/token. The current
  connection settings match Upstash's BullMQ example. Select a database with eviction
  disabled and account capacity for persistent worker connections/commands; BullMQ
  issues Redis commands even when idle. Actual Upstash credentials and limits remain
  unverified. [Upstash BullMQ integration](https://upstash.com/docs/redis/integrations/bullmq).

## External validation still required

These steps require credentials, provider configuration, a real browser/account flow,
or research data. Keep secrets in provider settings or ignored environment files;
they do not need to be pasted into chat.

1. **GitHub App and student consent.** Configure `GITHUB_APP_ID`, `GITHUB_APP_SLUG`,
   `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `GITHUB_PRIVATE_KEY`. Register the
   exact `GITHUB_CALLBACK_URL` (`https://API/auth/github/callback`), homepage and
   frontend repository-linking Setup URL. Grant Contents/Metadata/Pull requests read
   permissions, install on a test repository, and complete student consent/login/linking
   through the portal. Verify private repository selection, encrypted token persistence,
   and renewal of an actually expired user token. Resolve organization approval/SSO
   requirements in GitHub if applicable.
2. **Public webhook and complete commit flow.** Configure the App's HTTPS
   `/webhooks/github` endpoint and matching `GITHUB_WEBHOOK_SECRET`; subscribe to Push
   and Pull request events. Push real supported-language changes and inspect GitHub's
   delivery result plus persisted analysis. Confirm PR delivery, redelivery without
   duplicate evidence/quiz, installation removal behaviour, and rate-limit recovery.
   A local signed ping does not satisfy this step.
3. **Supabase database and faculty Auth — core checks completed; secondary authorization test deferred.** The hosted TLS, migration and faculty-login checks above are verified. The remaining production-browser and negative authorization checks still apply. Original setup guidance: provide `DATABASE_URL`, TLS/CA settings,
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `FACULTY_EMAILS`. Review the migration against
   the actual existing schema before applying it; do not run fixture tests against
   that database. Verify hosted TLS connectivity, migrations/RLS, a confirmed faculty
   login and refusal of unallowlisted/student access to faculty evidence. Local
   PostgreSQL success does not prove compatibility with an unseen Supabase project.
4. **Groq question generation and grading.** Set `GROQ_API_KEY`; confirm the configured
   `GROQ_MODEL` is accessible to that account using the model API and a real completion.
   If the retained LLaMA model is unavailable, explicitly select an account-accessible
   model via the existing variable and assess its output. Trigger a quiz from an actual
   flagged commit, review 2–3 grounded questions, submit answers, and verify saved rubric
   grades/explanations and score updates. Check quota and retry behaviour without
   intentionally exhausting provider limits.
5. **Upstash-hosted queue.** Supply the TLS Redis URL/password, verify eviction and
   connection/command limits in the console, then confirm the deployed producer and
   worker process the real webhook job. Check that retries/reconnects and delivery
   deduplication work on that hosted database. The local Redis TLS test does not certify
   an Upstash account's configuration.
6. **Render/Vercel deployment and browser session.** Link the repository to both
   providers, select the documented root directories and Render plan, and populate
   the remaining secret/configuration fields, including stable independent
   `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY`. Confirm Render migration/startup/ready logs
   and Vercel's built `config.js` and direct navigation to protected/callback routes.
   Configure HTTPS frontend/API custom domains under the same site for dependable
   browser cookie behaviour. Set exact `FRONTEND_URL`, `API_URL` and GitHub callback
   origins; verify actual student/faculty sessions, logout, CORS and rejected foreign
   origins in the target browser. Complete the portal-to-faculty demonstration and
   documented override without manually editing application records. Production
   hosting limits, TLS/DNS and third-party-cookie restrictions remain untested.
7. **Scientific validation.** Obtain cross-project, independently labelled development
   histories and assess generalization/false positives. The deterministic test styles
   and local XGBoost execution do not establish authorship accuracy or misconduct.

The local Docker validation database contains isolated test records, not real student
data. The test-created containers and frontend development server were stopped after
validation; test volumes persist. Keep this database separate from a real demonstration
database, and never run fixture tests against production. Additional temporary TLS
containers used in this follow-up were stopped and removed; the locally built image
remains available as `codesentinel-validation:external`. Temporary certificate/key
files were removed. No provider resources were
created or deployed.

Render first deployment (2026-09-21): Docker build and dependency installation succeeded at cd3b074. Startup exited 127 because the single-quoted Docker command was interpreted as one executable name. Both single- and double-quoted inline commands failed identically. The Docker command now invokes `/bin/sh /app/start.sh`, which runs the same migration runner and then execs NestJS without nested command quoting; verified by successful deployment `dep-daojqkajnfac7398he0g` of commit `0492b81`, NestJS startup logs, and public `/health/ready` returning HTTP 200 with `{"status":"ready"}`. Because the script uses `set -e`, reaching NestJS confirms the existing migration runner exited successfully. No new fixture data was inserted. Assigned backend URL: https://codesentinel-api-rilz.onrender.com.

After the startup-script correction: backend build/10 tests, frontend 21 ChromeHeadless tests and 6 ML tests passed. Shell syntax validation passed. Production Python/tree-sitter/XGBoost packages installed during the Docker build; actual hosted analysis still requires the real commit workflow.

Vercel deployed the unchanged frontend from main at https://codesentinel-ochre.vercel.app. `/`, `/login`, `/faculty/cohort` and `/config.js` returned HTTP 200, with the generated config pointing to the actual Render backend. Render production URL settings were corrected using revealed fields (masked controls initially did not persist edits). After redeployment, readiness returned HTTP 200 with credentialed CORS allowing exactly https://codesentinel-ochre.vercel.app. Production student GitHub login and session persistence after reload subsequently succeeded in the current browser. Production faculty login still requires its separate browser verification.

### Live testing checkpoint — 2026-09-23

- Backend build and all 14 tests passed, including four added Groq error/response tests. A reproduced null question collection/entry caused a TypeError; two optional-chain guards now return the intended safe retriable 503. This minimal fix is local and has not yet been deployed.
- All 6 Python ML tests passed. Frontend production build passed with the existing 510.98 kB initial-bundle warning (500 kB budget). The sandboxed ChromeHeadless run failed before executing tests because Chrome's GPU process could not launch; the unrestricted rerun passed all 21 tests on September 23 without changing browser security or application code.
- Isolated PostgreSQL/Redis HTTP and workflow integration tests passed 2/2 when run serially. A concurrent run hit the HTTP startup deadline before the successful serial rerun. Fixtures were confined to the local validation database, never hosted Supabase.
- GitHub production homepage, OAuth callback, setup redirect and signed webhook URL were saved. Live inspection found missing App repository permissions. With specific user approval, Contents/Metadata/Pull requests read-only permissions and Push/Pull request subscriptions were saved. Installation acceptance restricted to `codesentinel-test-student` remains pending: the repository picker did not return that private repository, and a refreshed form requires GitHub identity confirmation.
- The dedicated private test repository contains nine real current-time commits, explicitly identified as assistant-authored integration history. It is not an authorship accuracy benchmark. Repository linking and hosted commit analysis are not yet verified.
- The known local backend worker was stopped to prevent it consuming production queue jobs during deployment validation.
- Groq's real completion previously succeeded with account response headers reporting 1,000 requests and 8,000 token rate-limit capacities. These are quota windows, not an API-key lifetime token allowance. Tests cover safe handling of 429/network failures; no quota was intentionally exhausted. The runtime caps output at 2,400 tokens and diff context at 24,000 characters; that character cap does not guarantee a token-per-minute budget. Live large-commit generation and sequential grading remain to be verified.

FINAL PROJECT STATUS: NOT YET DEMO READY

Remaining critical path: link the test repository; verify Render consumes real webhook jobs and persists AST/baseline/anomaly evidence; complete real Groq quiz/answers/grading; verify production faculty evidence and override; deploy the validated null-response fix. Secondary negative faculty-login and event-redelivery/PR checks remain outstanding.

Follow-up: installation permissions are now accepted and restricted to the single private `codesentinel-test-student` repository. Fresh student OAuth and private-repository discovery succeeded. The first link request reproduced an installation-token signing failure: the ignored local environment file contained an unquoted multiline PEM, so dotenv loaded only its header. The existing complete key was privately validated and its assignment quoted correctly. Real GitHub installation-token issuance and private-repository API access then succeeded locally. The corrected existing key was submitted to Render (deployment `dep-daprogou01pc73dnv4hg`); no key rotation occurred. Read-only Supabase inspection found no linked test repository yet, and Upstash PING succeeded. Production link retry awaits the deployment.
