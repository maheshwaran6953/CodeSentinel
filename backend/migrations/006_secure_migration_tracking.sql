-- The runner owns this operational table; browser clients never read or write it.
-- Existing migrations and their timestamps are retained.
ALTER TABLE IF EXISTS public.schema_migrations ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE browser_role text;
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    REVOKE ALL ON public.schema_migrations FROM PUBLIC;
    FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
        EXECUTE format('REVOKE ALL ON public.schema_migrations FROM %I',browser_role);
      END IF;
    END LOOP;
  END IF;
END $$;
