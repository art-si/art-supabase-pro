-- Guard navigation must locate one favorite route before pagination, across tenant scopes.
BEGIN;

DO $schema$
BEGIN
  IF to_regprocedure('public.tms_list_favorite_routes_secure(integer,integer,uuid,uuid,boolean,text,uuid)') IS NULL
     OR has_function_privilege('anon','public.tms_list_favorite_routes_secure(integer,integer,uuid,uuid,boolean,text,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Favorite route record locator API/grant is invalid'; END IF;
END $schema$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
SELECT set_config('request.headers','{}',true);
DO $ordinary$
DECLARE v_rows jsonb;
BEGIN
  v_rows:=public.tms_list_favorite_routes_secure(0,9,NULL,NULL,NULL,NULL,
    '8eb09093-28dc-4744-a725-7422db2d7440');
  IF (v_rows->>'total')::int<>1 OR v_rows->'records'->0->>'id'<>'8eb09093-28dc-4744-a725-7422db2d7440'
  THEN RAISE EXCEPTION 'Ordinary route locator did not return exact row'; END IF;
  IF (public.tms_list_favorite_routes_secure(0,9,NULL,NULL,NULL,NULL)->>'total')::int<2
  THEN RAISE EXCEPTION 'Original six-argument route API regressed'; END IF;
END $ordinary$;
SELECT set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
DO $forged$
BEGIN
  IF (public.tms_list_favorite_routes_secure(0,9,NULL,NULL,NULL,NULL,
      '8eb09093-28dc-4744-a725-7422db2d7440')->>'total')::int<>1
  THEN RAISE EXCEPTION 'Forged ordinary tenant header changed route locator scope'; END IF;
END $forged$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
SELECT set_config('request.headers','{}',true);
DO $platform_all$
BEGIN
  IF (public.tms_list_favorite_routes_secure(0,9,NULL,NULL,NULL,NULL,
      '8eb09093-28dc-4744-a725-7422db2d7440')->>'total')::int<>1
  THEN RAISE EXCEPTION 'Platform-all route locator missed exact row'; END IF;
END $platform_all$;
SELECT set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
DO $platform_selected$
BEGIN
  IF (public.tms_list_favorite_routes_secure(0,9,NULL,NULL,NULL,NULL,
      '8eb09093-28dc-4744-a725-7422db2d7440')->>'total')::int<>0
  THEN RAISE EXCEPTION 'Platform selected tenant saw another tenant route'; END IF;
END $platform_selected$;
RESET ROLE;
ROLLBACK;
