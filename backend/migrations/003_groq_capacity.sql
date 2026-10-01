-- Additive provider coordination; no credentials or historical quota estimates.
CREATE TABLE llm_capacity (
 scope text PRIMARY KEY,
 observed jsonb NOT NULL DEFAULT '{}',
 retry_at timestamptz,
 lease_id uuid,
 lease_until timestamptz
);
CREATE TABLE llm_results (
 request_key text PRIMARY KEY,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE llm_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON llm_capacity,llm_results FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON llm_capacity,llm_results FROM authenticated; END IF;
END $$;
ALTER TABLE responses ADD COLUMN grading_retry_at timestamptz;
ALTER TABLE responses ADD COLUMN grading_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE commits ADD COLUMN quiz_retry_at timestamptz;
ALTER TABLE commits ADD COLUMN quiz_attempts integer NOT NULL DEFAULT 0;
CREATE INDEX responses_grading_retry ON responses(grading_retry_at) WHERE grading_status='pending';
CREATE INDEX commits_quiz_retry ON commits(quiz_retry_at) WHERE quiz_status='pending';
