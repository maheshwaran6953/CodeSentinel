# Repository audit and implementation map

Audit performed 2026-09-09 before implementation. All tracked source, templates, styles,
tests, manifests and configuration were inspected. No AGENTS.md, existing environment
file, schema, migration, deployment file, backend source, AST module or trained model
was present. No production database credentials were available to inspect a live Supabase
schema. Migrations therefore create the repository's first schema; they do not assume
that a production database has already been configured.

## Original state

- README described phase 0/1, Angular 19, NestJS, Supabase/PostgreSQL, BullMQ/Redis,
  GitHub webhooks, Groq and Render/Vercel.
- Angular NgModules: AppModule, AuthModule, StudentModule. Routes: login, student
  dashboard, three-step repository linking, quiz interrogation; faculty route empty.
- AuthGuard and StudentGuard trusted a localStorage user. Login defaulted to mock
  student and faculty identities. Faculty's real login Observable never emitted.
- AuthService, RepositoryService, StudentService and QuizService were entirely mocked.
  Dashboard scores were hardcoded; quiz grades depended on answer length. Repository
  webhook registration always returned success. Every intended backend contract was missing.
- Three component spec files existed, but Jasmine 7 was incompatible with Zone.js testing.
  Tests lacked some Angular template imports. The quiz UI depended on service object
  mutation to retain answers, which would break after replacing fixtures with HTTP.
- Backend contained package.json only. `tsc` failed without tsconfig/source.
  NestJS 10 was mixed with incompatible TypeORM/JWT integration majors.
- Frontend compiled but failed its production stylesheet budget: the existing repository
  linking CSS was 9.09 kB against an 8 kB error budget. Existing CSS was preserved;
  the component warning/error budgets now accommodate it at 10/12 kB.
- Lockfiles were ignored, preventing reproducible installs. They are now tracked.
- No configured lint task existed; none was silently skipped or disabled.

## Current map

| Area | Implementation |
|---|---|
| Bootstrap/config | backend/src/main.ts, config.ts, app.module.ts |
| Auth and server roles | auth.ts, security.ts; GitHub App OAuth and Supabase faculty authentication |
| Database | database.ts, migrate.ts, migrations/001_initial.sql; TypeORM PostgreSQL connection, parameterized SQL |
| GitHub access | github.ts; user token refresh, encrypted tokens, installation tokens, paginated API reads |
| Repository linking | repositories.ts; authorized App repositories, validation, history sync |
| Signed ingress | webhook.ts; push, pull request, installation suspension/removal; exact raw-body HMAC |
| Async work | queue.ts, analysis.ts; BullMQ producer/worker, backfill, range expansion, retries |
| Velocity and score | scoring.ts; personal log-transformed rolling baseline, explicit missing-signal weights |
| AST and ML | stylometry.ts, ml/analyze.py; tree-sitter grammars, per-language history, experimental XGBoost |
| Interrogation | llm.ts, quiz.ts; real Groq JSON responses, validation, private rubric, persisted answer retries |
| Dashboards/review | dashboard.ts; student summary, faculty cohort/timeline/evidence, append-only overrides |
| Angular HTTP | services/api.interceptor.ts, auth/student/repository/quiz services; credentials and runtime URL |
| Angular auth | auth/callback.component.ts, auth/student/faculty guards; server session hydration |
| Faculty UI | faculty/faculty.component.*; 15-second updates, evidence, retry, review |
| Infrastructure | .env examples, Dockerfile, compose.yaml, render.yaml, frontend/vercel.json, CI |

## API contract inventory

Paths below are backend paths. Angular prepends `/api` for the local proxy or the
configured production API_URL. All private requests send the HTTP-only session cookie.
All private POST requests require an exact matching FRONTEND_URL Origin.

| Method/path | Access | Consumer / result |
|---|---|---|
| GET /auth/github | Public | Student login; redirect to GitHub |
| GET /auth/github/callback | OAuth state cookie | GitHub; sets session and redirects to Angular |
| POST /auth/login | Public, trusted Origin, rate-limited | Faculty tab; email/password/remember → User |
| GET /auth/me | Session | App initialization/callback → User |
| POST /auth/logout | Session | Both portals; revokes session |
| GET /auth/installation-url | Session | Repository setup → App install URL |
| GET /repositories | Student | RepositoryService → Repository[] |
| POST /repositories/link | Student | repositoryId → WebhookStatus |
| GET /student/dashboard | Student | StudentService → StudentDashboardData |
| GET /quizzes/active | Student | QuizService → QuizSession or null |
| POST /quizzes/questions/:id/draft | Owning student | answerText → boolean |
| POST /quizzes/questions/:id/answer | Owning student | answerText → LLMGradingResult with saved answer |
| GET /faculty/students | Faculty | Cohort rows |
| GET /faculty/students/:id | Faculty | Student, repositories, commit timeline |
| GET /faculty/commits/:id | Faculty | Signals, diff, questions, responses, grades, overrides, score history |
| POST /faculty/commits/:id/override | Faculty | action/reason; retains original score and flag |
| POST /faculty/commits/:id/retry | Faculty | Requeues failed/partial analysis or question generation |
| POST /webhooks/github | Valid HMAC | GitHub; bounded validation and durable queue handoff |
| GET /health, /health/ready | Public | Deployment liveness / DB and Redis readiness |

No student-supplied user ID, role, installation ID, repository owner, score, rubric or
grading result is trusted. Faculty is a deployment-wide cohort role, as there was no
existing class/department assignment model. Multi-tenant faculty scoping is not claimed.

## Evidence limitations / deliberate bounds

- First link imports the latest 50 commits on the default branch, oldest first. Future
  pushes and same-repository PR commits extend history. GitHub bounds some API results:
  commit file listing reaches 3000; PR commit listing reaches 250.
- Unknown/mismatching GitHub author IDs, merges, and `Co-authored-by` commits are
  excluded from individual assessment. This is not cryptographic identity verification.
- Root .gitignore plus common build/vendor/generated/migration/secret-file exclusions
  are applied. Nested .gitignore and .gitattributes-generated rules are not interpreted.
- Tree-sitter parses full changed-file snapshots, not just newly authored AST nodes.
  Existing code in an edited file can influence the feature vector. At most 60 source
  files, 300 kB each; parse/retrieval limits are visible in faculty evidence.
- A bounded 24 kB diff is stored/sent to Groq; model questions cannot cover omitted code.
  Grading uses a private rubric, but LLM prompt injection and judgment errors remain
  research limitations. This is evidence for human review, not automated discipline.
- Baselines use observed history, not verified ground-truth authorship. Flagged history
  is excluded from model training. Language/task diversity can shift style legitimately.
- XGBoost is unavailable until at least three authors have ten eligible historical
  samples each. Its per-author chronological holdout is not cross-project validation.
- One BullMQ worker runs serially in the backend deployment. Run one replica for ordered
  baseline updates. Hosting sleep interrupts timely processing; an always-on service
  is needed for a dependable live demonstration.
- Faculty overrides annotate analysis; they do not erase scores, flags or quiz answers,
  and they do not automatically relabel training data.

## Dependency security

The requested Angular 19 and original NestJS 10/BullMQ 4 lines are retained. Available
in-range patches and backend transitive overrides address file-type, multer, body-parser,
qs and uuid advisories without replacing the framework. Backend HTTP error responses
do not reflect unknown paths. There is no multipart upload endpoint, SSR/hydration,
HttpTransferCache or dynamic/i18n template ingestion. Angular date formats are static.

`npm audit` still reports framework advisories that require major upgrades. This is not
a clean security audit or a claim of production hardening. Re-run audits before public
deployment and review a supported Angular/NestJS upgrade separately from this project's
architecture-preserving completion. See VALIDATION.md for recorded commands/results.
