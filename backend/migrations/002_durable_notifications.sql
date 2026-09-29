-- Additive only. No historical events are inferred or backfilled.
CREATE TABLE notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  student_id uuid NOT NULL REFERENCES users(id),
  repository_id uuid NOT NULL REFERENCES repositories(id),
  commit_id uuid REFERENCES commits(id),
  quiz_id uuid REFERENCES quizzes(id),
  question_id uuid REFERENCES questions(id),
  review_id uuid REFERENCES overrides(id),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE notification_recipients (
  event_id uuid NOT NULL REFERENCES notification_events(id),
  user_id uuid NOT NULL REFERENCES users(id),
  read_at timestamptz,
  PRIMARY KEY(user_id,event_id)
);
CREATE INDEX notification_recipient_unread ON notification_recipients(user_id,event_id) WHERE read_at IS NULL;
CREATE INDEX notification_event_order ON notification_events(created_at DESC,id DESC);
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON notification_events,notification_recipients FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON notification_events,notification_recipients FROM authenticated;
  END IF;
END $$;

-- Called inside the transaction which changes the workflow record.
-- Faculty delivery follows the existing all-students faculty authorization policy.
CREATE FUNCTION emit_notification(p_key text,p_kind text,p_repo uuid,p_commit uuid DEFAULT NULL,
  p_quiz uuid DEFAULT NULL,p_question uuid DEFAULT NULL,p_review uuid DEFAULT NULL,p_audience text DEFAULT 'both')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE event_id uuid; student uuid;
BEGIN
  SELECT student_id INTO student FROM repositories WHERE id=p_repo;
  INSERT INTO notification_events(event_key,kind,student_id,repository_id,commit_id,quiz_id,question_id,review_id)
    VALUES(p_key,p_kind,student,p_repo,p_commit,p_quiz,p_question,p_review)
    ON CONFLICT(event_key) DO NOTHING RETURNING id INTO event_id;
  IF event_id IS NULL THEN RETURN; END IF;
  INSERT INTO notification_recipients(event_id,user_id)
    SELECT event_id,id FROM users WHERE
      (p_audience IN ('both','student') AND id=student) OR
      (p_audience IN ('both','faculty') AND role='faculty');
END $$;

CREATE FUNCTION workflow_notification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE repo uuid; cid uuid; qid uuid; kind text; key text;
BEGIN
  IF TG_TABLE_NAME='repositories' THEN
    IF TG_OP='INSERT' THEN kind:='repository_linked';
    ELSIF NEW.active IS DISTINCT FROM OLD.active THEN
      kind:=CASE WHEN NEW.active THEN 'repository_restored' ELSE 'repository_access_removed' END;
    ELSE RETURN NEW; END IF;
    PERFORM emit_notification(NEW.id||':'||kind||':'||txid_current(),kind,NEW.id);
  ELSIF TG_TABLE_NAME='commits' THEN
    IF TG_OP='INSERT' THEN
      PERFORM emit_notification(NEW.id||':received','commit_received',NEW.repository_id,NEW.id);
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('completed','partial','failed','excluded') THEN
        kind:='analysis_'||NEW.status;
        PERFORM emit_notification(NEW.id||':'||kind||':'||txid_current(),kind,NEW.repository_id,NEW.id);
      END IF;
      IF NEW.quiz_status IS DISTINCT FROM OLD.quiz_status AND NEW.quiz_status IN ('pending','failed','no_diff') THEN
        kind:=CASE NEW.quiz_status WHEN 'pending' THEN 'discussion_requested' WHEN 'failed' THEN 'discussion_generation_failed' ELSE 'discussion_context_unavailable' END;
        PERFORM emit_notification(NEW.id||':'||kind||':'||txid_current(),kind,NEW.repository_id,NEW.id);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='quizzes' THEN
    SELECT repository_id INTO repo FROM commits WHERE id=NEW.commit_id;
    IF TG_OP='INSERT' THEN kind:='discussion_ready';
    ELSIF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status THEN kind:='discussion_completed';
    ELSE RETURN NEW; END IF;
    PERFORM emit_notification(NEW.id||':'||kind,kind,repo,NEW.commit_id,NEW.id);
  ELSIF TG_TABLE_NAME='responses' THEN
    IF NEW.is_draft THEN RETURN NEW; END IF;
    SELECT q.quiz_id,z.commit_id,c.repository_id INTO qid,cid,repo
      FROM questions q JOIN quizzes z ON z.id=q.quiz_id JOIN commits c ON c.id=z.commit_id WHERE q.id=NEW.question_id;
    IF TG_OP='INSERT' OR OLD.is_draft THEN
      PERFORM emit_notification(NEW.question_id||':submitted','answer_submitted',repo,cid,qid,NEW.question_id);
    END IF;
    IF TG_OP='INSERT' OR NEW.grading_status IS DISTINCT FROM OLD.grading_status THEN
      IF NEW.grading_status IN ('graded','failed') THEN
        kind:=CASE WHEN NEW.grading_status='graded' THEN 'grading_completed' ELSE 'grading_failed' END;
        PERFORM emit_notification(NEW.question_id||':'||kind||':'||txid_current(),kind,repo,cid,qid,NEW.question_id);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='overrides' THEN
    SELECT repository_id INTO repo FROM commits WHERE id=NEW.commit_id;
    PERFORM emit_notification(NEW.id||':review','faculty_review_recorded',repo,NEW.commit_id,NULL,NULL,NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER repository_notifications AFTER INSERT OR UPDATE ON repositories FOR EACH ROW EXECUTE FUNCTION workflow_notification();
CREATE TRIGGER commit_notifications AFTER INSERT OR UPDATE ON commits FOR EACH ROW EXECUTE FUNCTION workflow_notification();
CREATE TRIGGER quiz_notifications AFTER INSERT OR UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION workflow_notification();
CREATE TRIGGER response_notifications AFTER INSERT OR UPDATE ON responses FOR EACH ROW EXECUTE FUNCTION workflow_notification();
CREATE TRIGGER review_notifications AFTER INSERT ON overrides FOR EACH ROW EXECUTE FUNCTION workflow_notification();

-- Prevent browser database roles from invoking SECURITY INVOKER helper functions.
REVOKE ALL ON FUNCTION emit_notification(text,text,uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION workflow_notification() FROM PUBLIC;
