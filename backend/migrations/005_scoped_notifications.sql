-- Preserve existing event/read history while enforcing current class/team access.
ALTER TABLE notification_events ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE notification_events ALTER COLUMN repository_id DROP NOT NULL;
ALTER TABLE notification_events ADD COLUMN class_id uuid REFERENCES project_classes(id);
ALTER TABLE notification_events ADD COLUMN team_id uuid REFERENCES project_teams(id);

CREATE FUNCTION notification_visible(p_event uuid,p_user uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM notification_events e JOIN users u ON u.id=p_user
    WHERE e.id=p_event AND (
      (u.role='faculty' AND (
        (e.repository_id IS NOT NULL AND faculty_can_access_repository(u.id,e.repository_id)) OR
        (e.repository_id IS NULL AND EXISTS (
          SELECT 1 FROM project_classes cl WHERE cl.id=e.class_id AND (
            cl.advisor_id=u.id OR EXISTS (SELECT 1 FROM project_teams t WHERE t.id=e.team_id AND t.class_id=cl.id AND t.guide_id=u.id)
          )
        ))
      )) OR
      (u.role='student' AND (
        e.student_id=u.id OR (e.student_id IS NULL AND EXISTS (
          SELECT 1 FROM team_members m JOIN roster_students rs ON rs.id=m.roster_id
          WHERE m.team_id=e.team_id AND m.status IN ('invited','accepted') AND rs.user_id=u.id
        ))
      ))
    )
  );
$$;

CREATE OR REPLACE FUNCTION emit_notification(p_key text,p_kind text,p_repo uuid,p_commit uuid DEFAULT NULL,
  p_quiz uuid DEFAULT NULL,p_question uuid DEFAULT NULL,p_review uuid DEFAULT NULL,p_audience text DEFAULT 'both')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE event_id uuid; student uuid; team uuid; class uuid;
BEGIN
  SELECT r.student_id,r.team_id,t.class_id INTO student,team,class
    FROM repositories r LEFT JOIN project_teams t ON t.id=r.team_id WHERE r.id=p_repo;
  -- Unattributed commits remain unattributed; never fall back to the repository linker.
  IF p_commit IS NOT NULL THEN
    SELECT student_id INTO student FROM commits WHERE id=p_commit AND repository_id=p_repo;
  ELSIF team IS NOT NULL THEN
    student:=NULL;
  END IF;
  INSERT INTO notification_events(event_key,kind,student_id,repository_id,commit_id,quiz_id,question_id,review_id,class_id,team_id)
    VALUES(p_key,p_kind,student,p_repo,p_commit,p_quiz,p_question,p_review,class,team)
    ON CONFLICT(event_key) DO NOTHING RETURNING id INTO event_id;
  IF event_id IS NULL THEN RETURN; END IF;
  INSERT INTO notification_recipients(event_id,user_id)
    SELECT event_id,u.id FROM users u WHERE
      (p_audience IN ('both','faculty') AND u.role='faculty' AND faculty_can_access_repository(u.id,p_repo)) OR
      (p_audience IN ('both','student') AND u.role='student' AND (
        u.id=student OR (p_commit IS NULL AND p_quiz IS NULL AND p_question IS NULL AND team IS NOT NULL
          AND p_kind IN ('repository_linked','repository_restored','repository_access_removed') AND EXISTS (
            SELECT 1 FROM team_members m JOIN roster_students rs ON rs.id=m.roster_id
            WHERE m.team_id=team AND m.status='accepted' AND rs.user_id=u.id
          ))
      ));
END $$;

CREATE FUNCTION emit_academic_notification(p_key text,p_kind text,p_class uuid,p_team uuid,p_student uuid,p_recipients uuid[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE event_id uuid;
BEGIN
  INSERT INTO notification_events(event_key,kind,class_id,team_id,student_id)
    VALUES(p_key,p_kind,p_class,p_team,p_student)
    ON CONFLICT(event_key) DO NOTHING RETURNING id INTO event_id;
  IF event_id IS NULL THEN RETURN; END IF;
  -- Controllers select the audience transactionally; apply the same access check again here.
  INSERT INTO notification_recipients(event_id,user_id)
    SELECT event_id,u.id FROM users u WHERE u.id=ANY(p_recipients) AND notification_visible(event_id,u.id);
END $$;

REVOKE ALL ON FUNCTION notification_visible(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION emit_academic_notification(text,text,uuid,uuid,uuid,uuid[]) FROM PUBLIC;
