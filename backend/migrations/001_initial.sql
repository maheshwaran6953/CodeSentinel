CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id text UNIQUE, github_login text, supabase_id uuid UNIQUE,
  name text NOT NULL, email text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('student','faculty')),
  github_token text, github_refresh_token text, github_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), github_id text NOT NULL UNIQUE,
  student_id uuid NOT NULL REFERENCES users(id), installation_id text NOT NULL,
  owner text NOT NULL, name text NOT NULL, full_name text NOT NULL,
  default_branch text NOT NULL, url text NOT NULL, active boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT now(), last_webhook_at timestamptz
);
CREATE TABLE commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), repository_id uuid NOT NULL REFERENCES repositories(id),
  student_id uuid NOT NULL REFERENCES users(id), sha text NOT NULL,
  author text, author_github_id text, message text, committed_at timestamptz,
  additions integer, deletions integer, changed_files integer, files jsonb NOT NULL DEFAULT '[]',
  diff text, status text NOT NULL DEFAULT 'queued', error text,
  velocity jsonb, stylometry jsonb, features jsonb, signals jsonb,
  risk_score double precision CHECK (risk_score BETWEEN 0 AND 100),
  authenticity_score double precision CHECK (authenticity_score BETWEEN 0 AND 100),
  flagged boolean NOT NULL DEFAULT false, reasons jsonb NOT NULL DEFAULT '[]',
  quiz_status text NOT NULL DEFAULT 'not_required', created_at timestamptz NOT NULL DEFAULT now(),
  analyzed_at timestamptz, UNIQUE(repository_id, sha)
);
CREATE INDEX commits_history ON commits(student_id, committed_at);
CREATE TABLE quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), commit_id uuid NOT NULL UNIQUE REFERENCES commits(id),
  student_id uuid NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'pending',
  trigger_reason jsonb NOT NULL, model text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quiz_id uuid NOT NULL REFERENCES quizzes(id),
  ordinal integer NOT NULL, question_text text NOT NULL, code_snippet text,
  rubric text NOT NULL, UNIQUE(quiz_id, ordinal)
);
CREATE TABLE responses (
  question_id uuid PRIMARY KEY REFERENCES questions(id), student_id uuid NOT NULL REFERENCES users(id),
  answer_text text NOT NULL, is_draft boolean NOT NULL DEFAULT true,
  result jsonb, grading_status text NOT NULL DEFAULT 'draft', grading_error text,
  submitted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), commit_id uuid NOT NULL REFERENCES commits(id),
  faculty_id uuid NOT NULL REFERENCES users(id), action text NOT NULL CHECK(action IN ('legitimate','needs_review','note')),
  reason text NOT NULL, original_analysis jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE score_history (
  id bigserial PRIMARY KEY, commit_id uuid NOT NULL REFERENCES commits(id),
  risk_score double precision, authenticity_score double precision, signals jsonb NOT NULL,
  cause text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- The browser never accesses these tables directly. Only the backend DB role can.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON users,sessions,repositories,commits,quizzes,questions,responses,overrides,score_history FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON users,sessions,repositories,commits,quizzes,questions,responses,overrides,score_history FROM authenticated;
  END IF;
END $$;
