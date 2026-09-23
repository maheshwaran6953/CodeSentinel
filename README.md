# CodeSentinel

**Continuous Git-Integrated Authorship Verification for Academic Integrity Using AST-Based Stylometry and LLM-Driven Interrogation**

CodeSentinel follows a student's GitHub development history and combines personal velocity anomalies, AST style consistency, and technical understanding questions. It produces evidence for faculty review, not proof of ghostwriting, AI use, or misconduct.

The existing Angular student UI and NgModule architecture are preserved. The former mock services now use a NestJS API, PostgreSQL, BullMQ, tree-sitter/XGBoost, and real Groq calls. See [the audit and API map](docs/AUDIT.md) and [validation results](docs/VALIDATION.md) for tested scope and limitations.

## Architecture

```mermaid
flowchart LR
  S[Student Angular portal] --> A[NestJS authentication/API]
  G[GitHub App webhook] --> H[Raw-body HMAC validation]
  H --> Q[BullMQ / Redis]
  Q --> W[Asynchronous worker]
  W --> GH[GitHub commit and source API]
  W --> V[Personal velocity baseline]
  W --> P[Python tree-sitter / XGBoost]
  V --> DB[(Supabase PostgreSQL)]
  P --> DB
  W --> L[Groq commit-specific questions]
  L --> DB
  S --> R[Answer submission and Groq rubric grading]
  R --> DB
  DB --> F[Faculty evidence / overrides]
```

- **Frontend:** Angular 19, existing student dashboard/linking/quiz screens plus faculty cohort and evidence views.
- **Backend:** NestJS 10, TypeORM PostgreSQL connection, parameterized SQL, validated DTOs, server-enforced roles.
- **Database:** Supabase PostgreSQL; faculty passwords verified by Supabase Auth.
- **Queue:** BullMQ 4 with Redis TCP/TLS, including Upstash's Redis-compatible endpoint.
- **AST/ML:** tree-sitter for Python, JavaScript/JSX, TypeScript/TSX and Java; XGBoost in an isolated Python child process. Source code is never executed.
- **LLM:** Groq, default `llama-3.3-70b-versatile`, configurable through `GROQ_MODEL`.
- **Deployment:** Render Docker backend; Vercel Angular frontend.

```text
frontend/src/app/     Existing Angular modules, screens, guards and HTTP services
backend/src/         Auth, GitHub, webhook, queue, worker, analysis, quizzes, dashboards
backend/ml/          AST extraction, experimental XGBoost training/inference and tests
backend/migrations/  Versioned PostgreSQL schema
backend/test/        Unit, database-contract and real Redis/PostgreSQL integration tests
docs/                Audit, limitations and validation record
compose.yaml         Optional local PostgreSQL and Redis
render.yaml          Render backend blueprint
frontend/vercel.json Vercel SPA deployment
```

## Prerequisites

Node.js 22 LTS (Node 24 was also used during local validation), npm, Python 3.12, and Git. Use Python 3.12 for the pinned grammar/model wheels. For the optional local database/queue, install Docker Desktop. For browser tests install Chrome/Chromium.

External accounts/configuration that cannot be created from this repository:

1. Supabase project and PostgreSQL connection credentials.
2. Redis server or Upstash TCP/TLS Redis endpoint, with persistence and `noeviction` where configurable.
3. GitHub App ID, client ID/secret, private key, webhook secret, configured URLs, and installation on student repositories.
4. Groq API key and access to the configured model.
5. Faculty accounts created/confirmed in Supabase Auth and approved in `FACULTY_EMAILS`.
6. Render/Vercel projects and deployment environment variables.

Do not put any real credentials in tracked files. No secrets or production accounts are included.

## Install and local development

Run from separate terminals. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

For this project, the downloaded public Supabase CA is stored at `backend/certs/supabase-ca.crt`. The Docker image includes it at `/app/certs/supabase-ca.crt`, and `render.yaml` sets `DATABASE_CA_FILE` accordingly. For local execution, use its absolute filesystem path. Database connection establishment allows 30 seconds; TLS certificate verification remains mandatory when `DATABASE_SSL=true`.

### 1. Database and Redis

Use Supabase/Upstash, or start local development services from the project root:

```bash
docker compose up -d postgres redis
```

Local values are `DATABASE_URL=postgresql://postgres:local-development-only@localhost:5432/codesentinel`, `DATABASE_SSL=false`, and `REDIS_URL=redis://localhost:6379`. Compose ports are bound to loopback and use persistent volumes. These are development credentials only.

If Windows reserves port 5432, set `POSTGRES_PORT=15432` in the shell before starting Compose and use port 15432 in DATABASE_URL. The validation run used a separate Compose project named `codesentinel-validation`.

For Supabase, obtain the direct or **session pooler** PostgreSQL URL from Connect. Use the session pooler if IPv6 direct connections are unavailable. URL-encode special password characters. Set `DATABASE_SSL=true`; certificate verification stays enabled. If a private CA is required, set `DATABASE_CA_FILE` to its PEM path. Never disable certificate verification to silence TLS errors.

### 2. Backend

```bash
cd backend
npm ci
python -m venv .venv
# Windows:
.venv/Scripts/python -m pip install -r ml/requirements.txt
# macOS/Linux:
# .venv/bin/python -m pip install -r ml/requirements.txt
```

Copy `backend/.env.example` to `backend/.env`, fill the required values, and set `PYTHON_EXECUTABLE` to the venv Python. Generate **separate** random values for `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY` and the GitHub webhook secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`TOKEN_ENCRYPTION_KEY` must be exactly 64 hex characters. Keep it stable: changing it makes stored GitHub tokens unreadable and requires users to sign in again. `JWT_SECRET` must contain at least 32 characters.

```bash
npm run migrate
npm run build
npm run start:dev
```

Migrations run transactionally with a migration ledger and advisory lock. They create users, sessions, repositories, commits/analysis, quizzes, questions, responses/grades, overrides and score history. There is no schema synchronization or automatic destructive reset. Use a new database/schema or review the migration carefully before applying it to a database containing unrelated tables of the same names.

All application tables have RLS enabled and no browser-access policies. The backend connects using the trusted database owner/application server role; the Supabase anonymous key is used only for faculty authentication. Never expose the database URL to Angular.

The BullMQ worker starts with the API by default. Keep **one backend replica** for serial history processing. `RUN_WORKER=false` disables processing and is intended for diagnostics, not a complete demo. Jobs use five exponential-backoff attempts. Completed/failed retention is bounded; commit/quiz database uniqueness additionally prevents duplicate evidence.

### 3. Frontend

```bash
cd frontend
npm ci
npm start
```

Open `http://localhost:4200`. The development server proxies `/api` to `http://localhost:3000` without colliding with Angular page routes. Keep the browser hostname consistent with `FRONTEND_URL` and GitHub callback settings; do not mix `localhost` with `127.0.0.1` for cookies.

`frontend/.env.example` documents the public `API_URL` build variable; Angular does **not** automatically load that file. `scripts/config.cjs` writes a public runtime configuration asset at build/start time. Locally it defaults to `/api`. For deployment, supply the HTTPS backend origin as `API_URL`, without a trailing slash. Never put secrets in this variable.

## GitHub App setup

Create a GitHub App, retaining the **App** integration model rather than an OAuth-only app.

- User authorization callback: `http://localhost:3000/auth/github/callback` locally, or `https://YOUR_API/auth/github/callback` in production. This must exactly match `GITHUB_CALLBACK_URL`.
- Homepage: frontend URL. Post-installation Setup URL: `FRONTEND_URL/student/repository-linking`.
- Webhook URL: a public HTTPS endpoint ending in `/webhooks/github`. For local development, forward a trusted tunnel to port 3000 and put that public URL in GitHub's webhook settings.
- Webhook secret: exactly the same value as `GITHUB_WEBHOOK_SECRET`.
- Repository permissions: **Contents: read**, **Metadata: read**, **Pull requests: read**.
- Events: **Push**, **Pull request**; installation lifecycle deliveries are also handled.
- Generate a private key and configure `GITHUB_PRIVATE_KEY` as PEM text. In `.env`, a quoted value may use literal `\n` escapes; hosting secret fields may contain real newlines.
- Enable user authorization. Expiring user tokens are supported, including encrypted refresh-token storage and rotation.
- Keep **Request user authorization (OAuth) during installation OFF**: login starts through `/auth/github` and establishes the required state cookie before installation. Keep wildcard matching and Device Flow OFF; set Redirect on update ON to return to repository linking.
- Install the App on each repository being monitored. Organization approval may be required.

Student flow: Continue with GitHub → Link Repository → Install/configure App if needed → refresh repository list → select → review → link. Linking checks both user access and installation access, stores the repository and queues history import. The App's central webhook is configured once in GitHub; CodeSentinel does not create a separate repository hook or falsely claim a delivery has arrived.

The initial import is the latest 50 default-branch commits, oldest first. Future pushes and PR events are queued separately; repository/SHA uniqueness prevents duplicate analysis. A commit with an unrecognized GitHub author or a merge/co-author trailer is retained as excluded evidence rather than attributed to the student.

## Faculty accounts and roles

Create faculty users in Supabase Authentication, confirm their email, and place their email addresses in the backend's comma-separated `FACULTY_EMAILS`. Faculty sign in with email/password on the existing Faculty Login tab. GitHub sign-ins create students only. Account creation/recovery links explain the administrator workflow; they do not silently grant faculty access.

The backend issues revocable HTTP-only cookies and checks a persisted session on every private request. Frontend guards are navigation aids; server role checks and ownership checks enforce access. Faculty can inspect the deployment-wide student cohort. Course-specific faculty membership is not part of this version.

For Render and Vercel on unrelated default domains, browser third-party-cookie restrictions may prevent authenticated API calls despite correct CORS. For a dependable deployment use HTTPS custom domains under the same site, e.g. `app.example.edu` and `api.example.edu`. Set `FRONTEND_URL` to the exact frontend origin. Cookies are Secure/SameSite=None in production; local cookies are SameSite=Lax. Private POSTs also validate Origin.

## Analysis, baselines and scoring

Velocity uses a rolling window of up to 30 earlier personal commits. Additions, deletions, changed-file count and time gaps are log-transformed; a Z-score compares the current values with that student's own history. A variance floor avoids division by zero. Eight previous samples are needed for a velocity judgment. The default flag threshold is 3, configurable from 2 to 10 with `VELOCITY_Z_THRESHOLD`. A large commit alone does not imply misconduct.

AST extraction reports identifier naming/length, function size/decomposition, control nesting, loops/conditions, comments, calls, exceptions, literals/imports/returns, and node distributions. Generated/vendor/build/lock/migration/secret files and root `.gitignore` matches are excluded. Retrieval and parsing limits are visible in evidence; unsupported languages do not receive invented predictions.

Per-language history maturity is explicit: insufficient history → learning → stable. A mature comparison needs at least eight earlier eligible samples and 80 AST nodes in the current sample. Until enough authors exist for XGBoost, a labelled **standardized AST distance** is a descriptive fallback, not an ML prediction.

XGBoost automatically trains on stored historical features once at least three students have ten eligible samples each for that language. It uses a chronological per-author 80/20 holdout, reports balanced accuracy, persists model/schema metadata in a private cache, and only contributes its experimental uncalibrated consistency signal if holdout balanced accuracy reaches 0.65. Otherwise the labelled statistical indicator remains in use. No trained model, scientific accuracy claim, or fabricated training corpus is shipped. `MODEL_DIRECTORY` optionally overrides the private cache directory; cache loss causes retraining from persisted history.

Signals are combined as risk: velocity 0.30, stylometry 0.40, quiz risk (100 minus understanding score) 0.30. Missing signals are omitted and remaining weights normalized. With no usable signals, scores are **null**, displayed as Learning. `authenticityScore = 100 - riskScore`; each signal, weight, maturity, reason and score-history entry remains inspectable. Either velocity or stylometry flagging can trigger a quiz independently of the aggregate.

## Groq interrogation and grading

Set `GROQ_API_KEY` and `GROQ_MODEL`. On 2026-09-21, the configured account did not list the historical LLaMA default; real question generation and grading passed with `GROQ_MODEL=openai/gpt-oss-20b`, now selected in the deployment blueprint. Check account model availability before changing this value. Flagged commits with usable source diffs produce two or three commit-specific technical questions. The model sees bounded diff/metadata/anomaly context and returns validated JSON. Questions avoid accusations; faculty-only rubrics are not sent to students.

Answers (20–1000 characters) and drafts are persisted. Groq evaluates technical correctness, relevance, reasoning, design understanding and tradeoffs. The backend validates rubric ranges and calculates the final understanding score with weights 35/20/20/15/10. It stores explanation, confidence, model and rubric version. Confidence is the LLM's self-report, not calibrated statistical confidence.

An LLM failure never creates static replacement questions or fabricated grades. Raw submitted answers survive failure; retry grading uses the same original submission. Already graded answers are idempotent. When all questions are graded, the commit's combined score and score history update atomically. Faculty can retry failed generation/analysis from the evidence view. Original flags remain visible after grading or manual review.

## Faculty review and updates

Faculty can drill from cohort → student → commit and inspect velocity calculations, AST/model details, file exclusions, diff, question rubrics, raw answers, grading rationale, score history and prior overrides. Review actions are `legitimate`, `needs_review`, or `note`, with a required reason. Each stores faculty ID, timestamp and original analysis; no original score or evidence is deleted.

Student and faculty dashboards poll every 15 seconds. The student portal retains the original design's authenticity summary, repository status, recent commits and triggered quizzes. Repository authorization and receipt of a signed webhook are separate states.

## Tests and validation

```bash
cd backend
npm test
.venv/Scripts/python -m unittest discover -s ml -p "test_*.py"
# Linux: .venv/bin/python -m unittest discover -s ml -p 'test_*.py'

cd ../frontend
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
```

Set `CHROME_BIN` if Chrome is not detected. The backend suite uses real embedded PostgreSQL and real tree-sitter for database/service contracts; GitHub/Groq fixture transports are confined to tests and do not verify live provider calls.

For the separately configured real Redis/PostgreSQL integration test, use a **dedicated test database** migrated with `npm run migrate`, then set `TEST_DATABASE_URL`, `TEST_REDIS_URL` (a dedicated Redis DB), and `PYTHON_EXECUTABLE`:

```bash
node --test test/integration.cjs test/http.integration.cjs
```

This tests the real BullMQ producer/consumer and database, with explicitly labelled GitHub/Groq fixtures. It creates test records and must not point at production. CI provisions PostgreSQL and Redis and runs this test. No lint command existed; strict TypeScript/Angular compilation and critical tests are used.

## Production deployment

Current frontend: https://codesentinel-ochre.vercel.app. Current backend: https://codesentinel-api-rilz.onrender.com. Use `FRONTEND_URL=https://codesentinel-ochre.vercel.app` on Render and `API_URL=https://codesentinel-api-rilz.onrender.com` on Vercel. GitHub callback: `https://codesentinel-api-rilz.onrender.com/auth/github/callback`; webhook: `https://codesentinel-api-rilz.onrender.com/webhooks/github`; installation setup: `https://codesentinel-ochre.vercel.app/student/repository-linking`. Provider-side GitHub configuration and authenticated E2E remain pending; see `docs/VALIDATION.md`.

**Backend / Render:** use `render.yaml` or a Docker web service rooted at `backend`. The Dockerfile installs Python/grammar/XGBoost dependencies and compiles NestJS. Supply every secret/configuration from the backend environment example. The blueprint explicitly selects the free plan and runs `/bin/sh /app/start.sh` as the Docker command. This uses the existing transactional migration runner and stops startup on migration failure; previously applied migrations are skipped. Render pre-deploy commands and deployment shells require paid compute, so the free configuration does not use them. Use `/health/ready` for database/Redis readiness. The free service sleeps when idle and has limited memory; validate Node plus XGBoost memory use and wake the service before the demonstration. An always-on paid instance requires explicit approval. Keep one replica.

**Frontend / Vercel:** root directory `frontend`, build `npm run build`, output `dist/codesentinel-frontend`. Configure public `API_URL`, deploy, set backend `FRONTEND_URL`, and configure the GitHub callback/setup/webhook URLs. The checked-in Vercel rewrite supports refreshing Angular routes. Prefer same-site custom frontend/API domains for cookies.

**Security status:** the requested Angular 19 and original NestJS 10 lines are retained. In-range fixes and selected transitive patches are included, but dependency audits still report framework advisories requiring major upgrades. This is a demonstrable academic system, not a clean production security certification. Review [AUDIT.md](docs/AUDIT.md#dependency-security) and the recorded audit results before public deployment. Do not expose the Angular development server publicly.

## Demonstration checklist

1. Apply migrations; start database, Redis, backend/worker and frontend.
2. Create an approved faculty account and configure GitHub App/Groq credentials.
3. Student logs in with GitHub and authorizes/links a real repository through the portal.
4. History sync establishes eligible personal baselines; an empty/new history correctly shows Learning.
5. Student pushes code; GitHub's Recent Deliveries shows HTTP 202. Invalid signatures receive 401.
6. Worker stores the commit, computes velocity and AST evidence, and updates the portal.
7. A real anomaly against mature personal history triggers a commit-specific quiz. Do not lower safeguards or manually inject scores for a demo.
8. Student answers; Groq returns grading; answers, rationale and updated score persist.
9. Faculty opens the student and commit, reviews evidence and saves a reasoned override.

A repository without enough eligible history will not force an anomaly quiz. Prepare genuine development history in advance. If Groq is unavailable, the faculty retry control resumes generation once configuration/service availability is restored, without database edits.

## Troubleshooting

| Symptom | Check |
|---|---|
| Backend exits on startup | Missing named environment variables, DATABASE_URL, TLS certificates and migrations |
| Login redirects with an error | App client secret, exact callback URL, OAuth state cookie, consistent hostname |
| Faculty denied | Confirmed Supabase Auth email, SUPABASE_URL/ANON_KEY and FACULTY_EMAILS |
| Empty repository list | Check App Contents/Metadata/Pull requests read-only permissions, accept pending installation permission updates, select the intended repo, then refresh; also check organization approval and user access |
| Repository authorized but no deliveries | App webhook URL/event subscriptions and GitHub Recent Deliveries; localhost needs a public tunnel |
| Webhook 401 | Exact secret and unmodified raw bytes; do not test with reserialized JSON signatures |
| Queued work stalls | REDIS_URL must be redis:// or rediss:// TCP, not the Upstash REST endpoint; check worker setting and Redis persistence |
| API rate limited or repository unavailable | GitHub permission/installation state, rate-limit reset and worker retries |
| AST unavailable | Correct venv executable, installed requirements, supported language, source size/parse errors |
| Learning/no score | Expected before sufficient personal history; unknown authors and generated code do not mature the baseline |
| Quiz generation/grading failed | GROQ_API_KEY, active model ID, organization/model quota and response schema; use retry after the quota reset, original answers remain saved. The 2,400-token output cap and 24,000-character diff cap do not guarantee requests fit a tokens-per-minute quota. Avoid parallel demo submissions. |
| First request displays Render loading | The free backend sleeps when idle. Open the backend readiness URL and wait for `ready` before the demonstration; this is a hosting cold start, not a completed application request. |
| Session missing only in production | HTTPS cookie, exact CORS origin, browser third-party-cookie restrictions; use same-site custom domains |
| npm.ps1 blocked on Windows | Use npm.cmd; no need to change machine execution policy |
| PyPI has no matching tree-sitter distribution | Use Python 3.12 and a package index that mirrors the grammar wheels; public PyPI was used in validation |

## Author

Mahesh Waran (B.Tech IT, VSB Engineering College)

## License

MIT (as declared by the original project).
