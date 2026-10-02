-- Preserve existing accounts, repositories and evidence. No roster fixtures.
CREATE TABLE project_classes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), advisor_id uuid NOT NULL REFERENCES users(id),
 department text NOT NULL, section text NOT NULL, graduation_year integer NOT NULL CHECK(graduation_year BETWEEN 2000 AND 2200),
 team_member_limit integer NOT NULL DEFAULT 2 CHECK(team_member_limit BETWEEN 1 AND 20),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(department,section,graduation_year)
);
CREATE TABLE roster_students (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL REFERENCES project_classes(id),
 register_number text NOT NULL, name text NOT NULL, github_login_hint text,
 user_id uuid UNIQUE REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(class_id,register_number), UNIQUE(id,class_id)
);
CREATE TABLE roster_claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), roster_id uuid NOT NULL REFERENCES roster_students(id),
 user_id uuid NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE UNIQUE INDEX roster_pending_user ON roster_claims(user_id) WHERE status='pending';
CREATE TABLE project_teams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL REFERENCES project_classes(id),
 name text NOT NULL, project_title text NOT NULL, guide_id uuid REFERENCES users(id), lead_roster_id uuid NOT NULL,
 approved boolean NOT NULL DEFAULT false, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(class_id,name), FOREIGN KEY(lead_roster_id,class_id) REFERENCES roster_students(id,class_id)
);
CREATE TABLE team_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES project_teams(id),
 roster_id uuid NOT NULL REFERENCES roster_students(id), status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','accepted','left')),
 invited_by uuid NOT NULL REFERENCES users(id), invited_at timestamptz NOT NULL DEFAULT now(), joined_at timestamptz, left_at timestamptz
);
CREATE UNIQUE INDEX team_one_active_membership ON team_members(roster_id) WHERE status IN ('invited','accepted');
CREATE INDEX team_member_lookup ON team_members(team_id,status);
CREATE TABLE academic_audit (
 id bigserial PRIMARY KEY, actor_id uuid NOT NULL REFERENCES users(id), class_id uuid REFERENCES project_classes(id),
 team_id uuid REFERENCES project_teams(id), action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE repositories ADD COLUMN team_id uuid REFERENCES project_teams(id);
CREATE UNIQUE INDEX team_one_repository ON repositories(team_id) WHERE team_id IS NOT NULL;
ALTER TABLE commits ALTER COLUMN student_id DROP NOT NULL;

-- Snapshot existing faculty access for legacy personal projects. New guide accounts
-- are never implicitly granted legacy access. Team assignment supersedes this grant.
CREATE TABLE legacy_faculty (faculty_id uuid PRIMARY KEY REFERENCES users(id));
INSERT INTO legacy_faculty SELECT id FROM users WHERE role='faculty';
CREATE TABLE legacy_repo_faculty (
 repository_id uuid REFERENCES repositories(id), faculty_id uuid REFERENCES users(id), PRIMARY KEY(repository_id,faculty_id)
);
INSERT INTO legacy_repo_faculty SELECT r.id,f.faculty_id FROM repositories r CROSS JOIN legacy_faculty f;
CREATE FUNCTION grant_legacy_repository() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.team_id IS NULL THEN INSERT INTO legacy_repo_faculty SELECT NEW.id,faculty_id FROM legacy_faculty ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER legacy_repository_access AFTER INSERT ON repositories FOR EACH ROW EXECUTE FUNCTION grant_legacy_repository();

CREATE FUNCTION faculty_can_access_repository(p_faculty uuid,p_repo uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM repositories r LEFT JOIN project_teams t ON t.id=r.team_id
 LEFT JOIN project_classes cl ON cl.id=t.class_id WHERE r.id=p_repo AND
 ((r.team_id IS NOT NULL AND (cl.advisor_id=p_faculty OR t.guide_id=p_faculty)) OR
 (r.team_id IS NULL AND EXISTS(SELECT 1 FROM legacy_repo_faculty l WHERE l.repository_id=r.id AND l.faculty_id=p_faculty))))
$$;
CREATE FUNCTION faculty_can_access_student(p_faculty uuid,p_student uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM roster_students s JOIN project_classes cl ON cl.id=s.class_id
 WHERE s.user_id=p_student AND (cl.advisor_id=p_faculty OR EXISTS(SELECT 1 FROM team_members m JOIN project_teams t ON t.id=m.team_id
 WHERE m.roster_id=s.id AND m.status='accepted' AND t.guide_id=p_faculty)))
 OR EXISTS(SELECT 1 FROM repositories r WHERE r.student_id=p_student AND faculty_can_access_repository(p_faculty,r.id))
 OR EXISTS(SELECT 1 FROM commits c WHERE c.student_id=p_student AND faculty_can_access_repository(p_faculty,c.repository_id))
$$;

-- Database invariants supplement request validation; reserve invitation slots too.
CREATE FUNCTION check_team_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cls uuid; lim integer;
BEGIN
 IF NEW.status='left' THEN RETURN NEW; END IF;
 SELECT t.class_id,c.team_member_limit INTO cls,lim FROM project_teams t JOIN project_classes c ON c.id=t.class_id
 WHERE t.id=NEW.team_id FOR UPDATE OF t,c;
 IF NOT EXISTS(SELECT 1 FROM roster_students WHERE id=NEW.roster_id AND class_id=cls) THEN
  RAISE EXCEPTION 'Team members must belong to the same class' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM team_members WHERE team_id=NEW.team_id AND status IN ('invited','accepted') AND id<>NEW.id)>=lim THEN
  RAISE EXCEPTION 'Team member limit reached' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER team_membership_invariants BEFORE INSERT OR UPDATE ON team_members FOR EACH ROW EXECUTE FUNCTION check_team_membership();

DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['project_classes','roster_students','roster_claims','project_teams','team_members','academic_audit','legacy_faculty','legacy_repo_faculty'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',tab); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',tab); END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION grant_legacy_repository(),check_team_membership(),faculty_can_access_repository(uuid,uuid),faculty_can_access_student(uuid,uuid) FROM PUBLIC;
