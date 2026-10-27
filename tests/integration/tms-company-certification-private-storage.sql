-- Private company-certification attachments: tenant scope, owner and Storage operation checks.
BEGIN;

INSERT INTO storage.objects (bucket_id, name, owner_id, owner, metadata)
VALUES
  (
    'tms-company-certification-private',
    '2824c2b5-2774-4781-b995-f55e8bcee920/0a872664-874c-447d-a256-d0dbdca6ed45/00000000-0000-4000-8000-000000000101.png',
    '0a872664-874c-447d-a256-d0dbdca6ed45',
    '0a872664-874c-447d-a256-d0dbdca6ed45',
    '{"mimetype":"image/png","size":100}'::jsonb
  ),
  (
    'tms-company-certification-private',
    '111e83d3-190e-4405-84c8-440d484d13a6/0a872664-874c-447d-a256-d0dbdca6ed45/00000000-0000-4000-8000-000000000102.png',
    '0a872664-874c-447d-a256-d0dbdca6ed45',
    '0a872664-874c-447d-a256-d0dbdca6ed45',
    '{"mimetype":"image/png","size":100}'::jsonb
  ),
  (
    'tms-company-certification-private',
    '7529f951-938e-4e2c-ac0d-316c136ae1f9/5774aa51-3bbb-4da5-abd4-7ea44b44ea6a/00000000-0000-4000-8000-000000000103.png',
    '5774aa51-3bbb-4da5-abd4-7ea44b44ea6a',
    '5774aa51-3bbb-4da5-abd4-7ea44b44ea6a',
    '{"mimetype":"image/png","size":100}'::jsonb
  );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '0a872664-874c-447d-a256-d0dbdca6ed45', true);
SELECT set_config('request.jwt.claims', '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
SELECT set_config('request.headers', '{}', true);
SELECT set_config('storage.operation', 'object.sign', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'tms-company-certification-private'
    AND name ~ '/00000000-0000-4000-8000-00000000010[123][.]png$') <> 3 THEN
    RAISE EXCEPTION 'Platform-all private sign scope failed';
  END IF;
  PERFORM set_config('request.headers', '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}', true);
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'tms-company-certification-private'
    AND name ~ '/00000000-0000-4000-8000-00000000010[123][.]png$') <> 1 THEN
    RAISE EXCEPTION 'Platform-selected private sign scope failed';
  END IF;
  PERFORM set_config('storage.operation', 'object.list', true);
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'tms-company-certification-private'
    AND name ~ '/00000000-0000-4000-8000-00000000010[123][.]png$') <> 0 THEN
    RAISE EXCEPTION 'Private object listing unexpectedly allowed';
  END IF;
  PERFORM set_config('storage.operation', 'object.sign', true);
  PERFORM set_config('request.jwt.claim.sub', '5774aa51-3bbb-4da5-abd4-7ea44b44ea6a', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"5774aa51-3bbb-4da5-abd4-7ea44b44ea6a","role":"authenticated"}', true);
  PERFORM set_config('request.headers', '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}', true);
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'tms-company-certification-private'
    AND name ~ '/00000000-0000-4000-8000-00000000010[123][.]png$') <> 1 THEN
    RAISE EXCEPTION 'Ordinary forged-header private sign scope failed';
  END IF;
END;
$$;

SELECT 'company private Storage scope passed' AS result;
ROLLBACK;
