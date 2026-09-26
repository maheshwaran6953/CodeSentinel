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

### Live pipeline and grading checkpoint — 2026-09-23

- Corrected-key deployment succeeded; repository linking succeeded through the production browser. Commit `1bec04a` (null-response handling and tests) is live as Render deployment `dep-daprp0v1n1ps739qdcgg`.
- The initial nine test commits were correctly excluded because their Git author email was not associated with the authenticated GitHub account. They were preserved. The dedicated repository alone was configured with the account's verified GitHub no-reply identity for subsequent commits; no global Git configuration or existing history was changed.
- Nine further incremental commits arrived via a real push webhook. Hosted Supabase confirms `last_webhook_at`, nine completed analyses and nine non-null feature records. The local worker was stopped, so these results came from Render through Upstash. Student dashboard displayed 18 total commits: nine excluded and nine analysed.
- Real commit `ee11d5fb270c9f378cef51e6dd590231cbedb7c8` added a 92-line reporting feature. Production Python/tree-sitter parsed 734 AST nodes. Personal velocity and stylometry baselines were stable; both raised anomalies without database manipulation. The stylometry method was `standardized_ast_distance`, with `modelStatus: not_trained` and nine history samples. Production XGBoost training is not claimed: one account does not meet the multi-author training requirements.
- Groq generated three commit-specific questions. Student portal displayed them and saved a labelled integration-test draft. The first real grading request returned an explanation and rubric scores but omitted required `confidence`; the app rejected it and preserved the original response for retry.
- A second diagnostic real request reproduced the missing field (HTTP 200, 2,204 total tokens, 6,258 remaining token quota reported). A minimal local fix requests strict JSON Schema grading for the two documented GPT-OSS models, retaining JSON object mode for other configured models and all existing runtime validation. A real request with the fix returned a valid grade, confidence and explanation. Reference: https://console.groq.com/docs/structured-outputs.
- The new grading-contract test passed. Full regression is blocked by local memory exhaustion: 14/15 backend tests passed, but PGlite could not allocate WebAssembly memory; serial rerun also exhausted memory, and Python/OpenBLAS allocation failed. Windows reported roughly 450 MB free physical memory and 640 MB available virtual memory. The frontend rerun was stopped to reduce pressure. Earlier complete passing runs remain recorded above; these new failures are not reported as passes. The strict-schema fix is not yet deployed.

Current blockers: free local memory and rerun regressions; deploy the strict grading schema; retry the saved answer and complete all three real grades; verify hosted quiz/score persistence and faculty browser evidence/override. PR/redelivery and the deferred negative faculty-login tests remain outstanding. GitHub's delivery-history page currently requests identity confirmation, but actual push receipt and processing are independently verified in hosted data.

FINAL PROJECT STATUS: NOT YET DEMO READY

Memory recovery: after the user freed memory, all 15 backend tests, all 6 ML tests, frontend production build and all 21 ChromeHeadless tests passed. Both isolated local PostgreSQL/Redis HTTP and workflow integration tests passed (2/2). The existing frontend bundle-size warning remains non-fatal. Strict-schema grading is ready for deployment.

2026-09-24 continuation: commit 726fd93 was published with the strict Groq grading schema after all regression suites passed. Read-only hosted inspection confirms the test quiz remains pending: question 0 retains its failed submission for retry, and questions 1/2 have no responses. Render deployment completion and the successful browser retry are not yet verified. The prior in-app browser automation tool is unavailable in this session; manual browser continuation is required. No hosted application data was changed during these checks.

## Grading and scoring audit — user-reported realism issue

Read-only hosted inspection confirmed grades 72, 0, 0 for the live reporting quiz. Question 0 graded the original labelled technical test explanation retained after its earlier provider failure; the later pasted instructions did not replace that immutable submission. Questions 1 and 2 stored the pasted operational instructions and received zero for irrelevance. The editable retry UI obscures this behavior and needs to clearly display/lock the already submitted answer before a retry. No stored answers or grades were changed during this audit.

The first grade's explanation contains questionable technical expectations about tuple memory, thread safety and caching. Schema compliance is not evidence of grading correctness; rubric grounding and human review remain unresolved quality requirements.

The 92-line feature was flagged against nine nearly identical 7–9-line test increments (additions z=9.4517, threshold 3), alongside a naming-style change (standardized AST distance 7.1843, snake/camel features). Both heuristic signals saturated at 100. The deployed model explicitly reports not_trained. The weighted combination (velocity 30%, stylometry 40%, quiz 30%) produced 7.2 authenticity after a 24 average quiz score. These numbers are not calibrated authorship probabilities. Calling this short, correlated test history stable and presenting such a percentage can mislead users about normal feature development. The demonstration history is not representative training or validation data.

Real Groq grading and hosted persistence are now verified, but scientific validity and realistic false-positive behavior are not. The user requests replacing unsupported heuristic authorship judgments with a credible learned/evidence-based approach. Dataset availability and behavior while a model is unvalidated must be agreed before changing the scoring architecture. Existing evidence is preserved.

FINAL PROJECT STATUS: NOT YET DEMO READY


## Longitudinal evidence implementation — 2026-09-26

Supersedes the heuristic score interpretation in earlier chronological validation notes. The old records remain unchanged for audit.

Implemented: versioned evidence/abstention; volume-only trigger removal; multi-dimensional and language-specific baseline coverage; deduplicated snapshots; same-repository parent-chain continuity; per-file and function/class AST observations; repository structural evolution; test/import/call/symbol references; explicit exclusions and limits; neutral faculty-requested discussion; no automatic training from unverified GitHub identities; retained XGBoost training/reload infrastructure; immutable answer/retry reconciliation; raw provider/rubric/submission audit; faculty review snapshots including grades; evidence-led dashboards with null new authenticity/risk outputs. Existing JSONB storage is extended without schema changes or destructive migrations.

Verified locally on 2026-09-26:

- Backend TypeScript build and 23 tests pass, including real embedded PostgreSQL/tree-sitter service contracts, HMAC, role restrictions, abstention, bulk changes, one divergent module among matching files, ancestry ordering and immutable submission retries.
- Python 8/8 tests pass, including real XGBoost train/reload on explicitly test-only data and refusal to train on ordinary unverified histories.
- Angular production build passes. Existing 500 kB bundle warning remains (approximately 519 kB); it is not hidden.
- ChromeHeadless 24/24 tests pass, including exact saved-answer reconciliation and preventing legacy percentage display. Chrome initially failed within the filesystem sandbox; normal OS access resolved its startup limitation. No browser security controls were disabled.
- Real local PostgreSQL + Redis/BullMQ and NestJS HTTP integration tests pass 2/2. Initial ECONNREFUSED was caused by the stopped local Docker engine; existing validation services were started and tests rerun. No hosted fixture data was inserted.
- Two real Groq requests passed against the revised local implementation: three questions generated (2,523 tokens), structured grade/audit returned (2,085 tokens). Total 4,608 tokens; no database writes, key changes, plan changes or quota exhaustion test. These calls verify transport/schema/provenance, not grading accuracy or authorship validity.

Limits: continuity establishes structural relationships, not feature-semantic correctness; unmarked scaffolding is not reliably identifiable. Initial import and ancestry windows remain bounded. Baseline coverage requirements and review routing are transparent operational policies, not scientifically validated predictors. No consented independently labelled dataset or calibrated model exists. Historical raw provider responses that were previously discarded cannot be reconstructed. This implementation has not yet been verified in the deployed authenticated browser flow.

Remaining release checks: publish and verify the revised Render/Vercel deployment, then exercise evidence displays, a real newly analyzed commit, immutable grading retry and faculty discussion/review in the live browser. Earlier deferred PR/redelivery and non-allowlisted faculty tests remain separately outstanding.

FINAL PROJECT STATUS: NOT YET DEMO READY


### Production rollout and real abstention check — 2026-09-26

- Published source commit `b9727a4` to `codex/deploy-readiness`. The successful first Vercel build was not serving the production alias. Remote `main` was still `0871d9b`; verified it was an ancestor and advanced it by a normal non-force push to `b9727a4`, preserving all history.
- Vercel production deployment `ELvYqvPo2ARoXueKNML9kfsj3ybz` reports success. The actual `codesentinel-ochre.vercel.app` JavaScript bundle contains the new evidence UI.
- Render now recognizes the new protected faculty discussion endpoint and returns 401 to an unauthenticated request; before rollout it returned 404 like the missing-route control. No session was fabricated and no discussion was created by this check.
- Added ten passing reporting regression tests in the existing dedicated integration repository, covering real filtering, serialization, bucket boundaries, copy isolation and CSV handling. Pushed actual commit `cbbf6373fcafc043a302394bb9216dbcd60b1c3a` (90 added lines). This repository remains an explicitly assistant-authored integration exercise, not student training/validation ground truth.
- Read-only verified-TLS Supabase inspection confirms the new commit completed through the live pipeline: `longitudinal-v2`, `Insufficient evidence`, `abstained=true`, baseline `learning`, `flagged=false`, `quiz_status=not_required`, authenticity/risk columns null, model/calibration unavailable and authorshipProbability null. One source file was parsed; continuity identified `test_reporting.py` as a test addition and retained the real before/after/parent SHA plus push index 1 of 1. Signed webhook timestamp: 2026-09-26T15:52:06.463Z. No manual database edits forced these outcomes.
- No local analysis worker was started; only isolated test workers ran against local PostgreSQL/Redis. The new hosted analysis therefore verifies Render, GitHub, Upstash, Python/tree-sitter and Supabase together under the new policy. Automatic XGBoost training is intentionally unavailable without a consented verified dataset.
- The dedicated local validation PostgreSQL container was returned to its original stopped state after successful integration tests. Its volume and other containers were preserved.

Remaining live acceptance: signed-in student/faculty browser verification of the new evidence display, faculty-requested discussion and review, and an immutable grading retry on the deployed UI. Current tooling cannot automate the signed-in in-app browser, so the user has been asked to refresh the student dashboard. The earlier PR/redelivery and deferred negative faculty-login tests remain outstanding. Scientific semantic validation/calibration remains future research, not a claimed deployment result.

FINAL PROJECT STATUS: NOT YET DEMO READY


Signed-in student confirmation: the user refreshed the production dashboard and confirmed it displays Evidence status instead of an authenticity percentage. Faculty browser acceptance is now in progress: the user was asked to open commit cbbf637 and request a neutral technical discussion with a documented integration-test reason. No automated session impersonation is used.

### Faculty discussion and layout follow-up — 2026-09-26

Read-only hosted verification after the faculty's request confirms three generated questions, stored raw generation audit, one faculty request review, and flagged=false for cbbf637. Student answers and the subsequent faculty review remain the core live acceptance steps; earlier secondary tests are not the reason for withholding demo acceptance.

Corrected quiz content-box padding overflow, narrow-screen action-bar layout, modal sizing, dashboard flex/grid shrink behavior, and spacing between faculty review actions. Frontend production build passes (existing bundle-size warning remains); ChromeHeadless tests pass 24/24. These checks do not substitute for authenticated visual acceptance of the deployed pages.


### Dashboard usability and reminders — 2026-09-26

Implemented a role-scoped current-activity inbox, browser-local read markers, correct repository/SHA links, faculty modal evidence with blurred backdrop, cohort activity/discussion context and a student action-oriented workspace. Added Groq response-header capacity observations and Retry-After cooldown without exposing credentials. No migration, roster fixtures, paid resource or provider setting change is required.

Checks: backend build and existing 23 tests pass; added inbox isolation/real PostgreSQL query and Groq cooldown tests pass (25 backend tests total). Frontend production build passes with the existing bundle-budget warning; 27 ChromeHeadless tests pass, including modal close races and commit links. Eight Python tests pass. Live rollout and authenticated visual acceptance of these new additions remain separate from these local results. The user confirmed existing faculty visibility of submitted student answers; the final third-answer/faculty-review persistence check is still outstanding.
