-- An ordinary owner can create an unreferenced price and delete it through the
-- normal guarded path. A user without Delete cannot invoke the delete RPC.
-- All temporary data is rolled back.
BEGIN;
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  owner_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  no_delete_user uuid := '543f8dea-2e27-4fe0-b009-f80d86155be6';
  price_id uuid;
  reference_count integer;
  denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', owner_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', owner_user, 'role', 'authenticated')::text, true);
  price_id := public.tms_create_carrier_price_secure(
    '{"carrier_id":"a9fc0002-1023-4620-9220-000000000001","origin_region":"河北省/邯郸市/武安市","destination_region":"山东省/济南市/历下区","transport_mode":"road","billing_method":"by_weight","transport_cost":100,"total_fee":100,"periodic_amount":100,"payment_total":100,"remark":"验收临时承运商报价·删除守卫预演"}'::jsonb
  );
  SELECT count(*) INTO reference_count
  FROM public.get_record_delete_dependency_details(
    'tms_carrier_price', ARRAY[price_id::text], NULL
  );
  IF reference_count <> 0 THEN
    RAISE EXCEPTION 'Temporary carrier price has unexpected references';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', no_delete_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', no_delete_user, 'role', 'authenticated')::text, true);
  denied := false;
  BEGIN
    PERFORM public.tms_delete_carrier_price_secure(price_id);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'User without Delete removed carrier price'; END IF;

  PERFORM set_config('request.jwt.claim.sub', owner_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', owner_user, 'role', 'authenticated')::text, true);
  IF NOT public.tms_delete_carrier_price_secure(price_id) THEN
    RAISE EXCEPTION 'Owner could not delete unreferenced carrier price';
  END IF;
END;
$test$;

ROLLBACK;
