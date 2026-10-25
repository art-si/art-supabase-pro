-- Existing two report fixtures; no business writes. All claims are rolled back.
BEGIN;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE result jsonb; scope text; purpose text;
  fixture_ids uuid[] := ARRAY['a9fc0009-1023-4620-9220-000000000001','a9fc0009-1023-4620-9220-000000000002']::uuid[];
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  FOREACH purpose IN ARRAY ARRAY['list','export'] LOOP
    FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}'] LOOP
      PERFORM set_config('request.headers',scope,true);
      result := public.vms_list_vehicle_violations_secure(p_ids=>fixture_ids,p_purpose=>purpose);
      IF (result->>'total')::integer <> 2 OR jsonb_array_length(result->'records') <> 2
      THEN RAISE EXCEPTION 'Platform all/own selected cannot read two fixtures (%)',purpose; END IF;
    END LOOP;
    PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
    result := public.vms_list_vehicle_violations_secure(p_ids=>fixture_ids,p_purpose=>purpose);
    IF (result->>'total')::integer <> 0 OR jsonb_array_length(result->'records') <> 0
    THEN RAISE EXCEPTION 'Platform selected scope leaks violation records (%)',purpose; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}'] LOOP
    PERFORM set_config('request.headers',scope,true);
    result := public.vms_list_vehicle_violations_secure(p_ids=>fixture_ids);
    IF (result->>'total')::integer <> 2 OR jsonb_array_length(result->'records') <> 2
    THEN RAISE EXCEPTION 'Ordinary own or forged-header scope incorrect'; END IF;
  END LOOP;
END $test$;
RESET ROLE;
ROLLBACK;
