# Evidence transition audit — 2026-09-24

## 1. Current violations

`scoring.ts` normalizes heuristic distances to 0–100 and subtracts from 100. Dashboard APIs and Angular show this as authenticity. `analysis.ts` triggers interrogation on velocity OR style; size alone can trigger. `analyze.py` calls eight snapshots a stable baseline, even when they repeat one file within minutes. It also uses unverified GitHub identities as automatic training labels and converts uncalibrated class outputs into risk. History excludes flagged commits, creating selection bias. Comparisons are aggregate language vectors, without architecture or function evidence. Push commits are individually queued, but retry ordering can leave gaps. Quiz retries correctly preserve submissions but the UI misleadingly permits editing after failure.

The observed 92-line event followed nine very small artificial integration-test commits. That is a useful pipeline test, not a defensible student baseline. The 72-point answer was the earlier saved technical response; the two zero-point answers were the subsequently pasted operational instructions. The misleading retry UI must be fixed; existing answers/grades must not be overwritten.

## 2. Required changes

Replace public authenticity/risk numbers with versioned observations and uncertainty. Preserve raw legacy calculations as historical records. New automatic review routing requires established history, adequate coverage and corroborating structural/style evidence; volume alone never triggers it. Routing is a transparent operational policy, not a validated classifier. Weak history abstains. Faculty can request neutral questions independently, with a recorded reason.

## 3. Preserved implementation

Keep NestJS/Angular, authentication/roles, HMAC webhooks, GitHub installation tokens, real per-commit retrieval, BullMQ, PostgreSQL, tree-sitter, XGBoost training/reload infrastructure, real Groq calls, immutable submitted answers and faculty override audit. Retain existing historical records. No runtime fixtures or fabricated probabilities.

## 4. Database / API / UI

Use the existing JSONB analysis and score-history envelopes for additive, versioned `evidence` snapshots, preserving nine-table compatibility and avoiding destructive migration. Store AST file/symbol artifacts alongside features; push context in the commit's signals envelope. New envelopes carry baseline, continuity, observations, model availability, limitations and review routing. Legacy records are explicitly labelled as legacy evidence requiring reassessment, never silently reclassified or shown as probability. Grade results retain the provider response, exact question/answer/rubric and model provenance. Faculty overrides snapshot evidence plus grades. Future calibrated models require dataset provenance, consent and validation metadata; no current model is labelled calibrated.

## 5. Development Continuity

Compare bounded, same-repository historical AST artifacts with current files. Track reused symbols/calls/imports, changed/new modules, function fingerprints, test changes and AST complexity progression. Link observations to actual paths and SHAs. Describe structural continuity and novelty; do not pretend lexical overlap establishes semantic correctness. Missing parent/history/source coverage produces explicit uncertainty. Feature semantics and undocumented offline work remain faculty questions. Individual commits retain push before/after, index/count and parent identities.

## 6. Baseline maturity

Assess distinct authored file/symbol volume, meaningful commits, observed development sessions, temporal spread and structural diversity together. Count latest known files once rather than summing repeated snapshots. Operational minimums are conservative coverage gates, not scientifically validated thresholds. Commit timestamps cannot prove working time or authorship. Missing older artifacts cause learning/abstention rather than invented maturity. Statistical comparisons may remain visible during learning but cannot trigger strong judgments. Automatically collected GitHub history is not consented training ground truth.

## 7. Faculty presentation

Cohort and timeline show evidence availability/review status, not student rankings. Drill-down presents reasons, baseline requirements/observed coverage, velocity deviations, file/function style, continuity with source references, exclusions and retrieval limits, model training/calibration status, exact questions/submissions/rubrics, LLM rationale and self-reported uncertainty, and faculty review trail. Explain that review routing, LLM rubric points and model activations are distinct from misconduct probability. Retain original analyses after review.

## Validation scope

Regression tests must cover compressed histories abstaining, large consistent changes not triggering review, multi-signal routing, artifact deduplication, function-level observations, immutable retry answers, legacy display, and persistence. Future consented labelled evaluation must use student/project-disjoint splits, leakage checks, precision/recall/F1, false positives, calibration where appropriate and drift monitoring. No such scientific metrics are claimed here.

## Implementation checkpoint — 2026-09-26

The first version is implemented locally in the existing architecture. New evidence uses `longitudinal-v2`; old numeric score columns are not deleted or reinterpreted. No database migration is needed for the JSONB extension. The detailed coverage minimums are published in README and in each evidence response. Faculty can explicitly request a neutral discussion during abstention. Baseline history now follows stored parent SHAs rather than selecting unrelated branches by timestamp.

Continuity supports structural relationships and repository/file/function/class observations, not independently validated semantic inference. `featureSemantics.status` explicitly reports `not_established`. Framework scaffolding without generated markers cannot be reliably identified and remains a limitation. The bounded 50-commit initial import and 100-record ancestry candidate window do not provide exhaustive history. Existing histories lacking the new artifacts remain learning/legacy until new eligible analysis is available. No historical scores, answers or faculty reviews are rewritten.

Raw provider output/provenance is retained for new question generation and grading; previously discarded raw responses cannot be reconstructed. Student responses omit private rubric/provider audit. Submission errors reconcile against the server, differing retries return a conflict, and feedback no longer auto-advances before the student can inspect it.

Future dataset integration must be server-controlled, use actual consent/provenance records, and independently verify labels. The Python provenance input is an integration contract, not a mechanism that proves consent. No runtime endpoint accepts it from students. A calibrated model would additionally require a versioned validation dataset, population/language/project scope, calibration method/artifact and independent evaluation; current envelopes deliberately report unavailable calibration and null probability.
