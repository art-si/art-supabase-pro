BEGIN;

DO $test$
DECLARE
  reviewer uuid;
  ordinary uuid;
  own_tenant uuid;
  qa_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  qa_ids uuid[] := ARRAY[
    'a9fc0003-1023-4620-9220-000000000001'::uuid,
    'a9fc0003-1023-4620-9220-000000000002'::uuid
  ];
  qa_waybills uuid[] := ARRAY[
    'baee5a01-6ac6-4fd9-858a-67ffd14e554a'::uuid,
    '4ac5fbc1-a163-41f4-a67d-1c8d91db74b1'::uuid
  ];
  v_driver_id uuid;
  image_paths text[];
  image_path text;
  denied_count int := 0;
  cert_state jsonb;
BEGIN
  SELECT auth_user_id INTO reviewer FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT auth_user_id, tenant_id INTO ordinary, own_tenant FROM public.sys_user
  WHERE user_email = '3@qq.com' AND auth_user_id IS NOT NULL LIMIT 1;
  IF reviewer IS NULL OR ordinary IS NULL OR own_tenant <> qa_tenant THEN
    RAISE EXCEPTION 'Driver certification test actors unavailable';
  END IF;
  IF has_function_privilege('anon',
      'public.tms_review_driver_certification_secure(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can review driver certificates';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', reviewer::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  cert_state := public.tms_get_driver_certification_secure(qa_ids[1]);
  IF cert_state->>'required' <> 'true' OR cert_state->>'certified' <> 'false'
      OR cert_state->>'canReview' <> 'true' THEN
    RAISE EXCEPTION 'Platform all-tenant certification state is incorrect';
  END IF;
  FOREACH v_driver_id IN ARRAY qa_ids LOOP
    BEGIN
      PERFORM app_private.tms_assert_driver_certified(qa_tenant, v_driver_id, 'carrier');
    EXCEPTION WHEN SQLSTATE '23514' THEN denied_count := denied_count + 1;
    END;
  END LOOP;
  IF denied_count <> 2 THEN
    RAISE EXCEPTION 'Both unverified QA carrier drivers must be denied';
  END IF;
  FOR denied_count IN 1..2 LOOP
    BEGIN
      PERFORM public.tms_accept_assigned_waybill(qa_waybills[denied_count]);
      RAISE EXCEPTION 'Unverified QA driver accepted an assigned waybill';
    EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
    END;
  END LOOP;
  BEGIN
    UPDATE public.tms_order
    SET dispatch_status = 'loaded', dispatch_driver_id = qa_ids[1]
    WHERE id = '9a9679c3-1b4e-4e01-8012-60b1087e0fb7';
    RAISE EXCEPTION 'Unverified QA driver bypassed dispatch gate';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM public.tms_review_driver_certification_secure(qa_ids[1], 'approved', NULL);
    RAISE EXCEPTION 'Approval without complete stored documents succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    UPDATE public.tms_driver_profile
    SET identity_auth_status = 'verified',
        license_auth_status = 'verified',
        qualification_auth_status = 'verified'
    WHERE driver_id = qa_ids[1];
    RAISE EXCEPTION 'Direct status forgery succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    UPDATE public.tms_driver_profile
    SET driver_ownership = 'self'
    WHERE driver_id = qa_ids[1];
    RAISE EXCEPTION 'Carrier-linked driver was reclassified as self to bypass review';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', ordinary::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', '028e6a68-a9db-4055-974c-1e05bfe94b0f')::text, true);
  cert_state := public.tms_get_driver_certification_secure(qa_ids[1]);
  IF cert_state->>'required' <> 'true' OR cert_state->>'canReview' <> 'false' THEN
    RAISE EXCEPTION 'Ordinary tenant certification read or reviewer permission is incorrect';
  END IF;
  BEGIN
    PERFORM public.tms_get_driver_certification_secure(
      'a5c1886b-4a8d-4ffd-8fe0-ecf3c2f017fb');
    RAISE EXCEPTION 'Forged header exposed another tenant certification';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.tms_review_driver_certification_secure(qa_ids[1], 'approved', NULL);
    RAISE EXCEPTION 'Ordinary user forged a certification review';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', reviewer::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', '028e6a68-a9db-4055-974c-1e05bfe94b0f')::text, true);
  BEGIN
    PERFORM public.tms_get_driver_certification_secure(qa_ids[1]);
    RAISE EXCEPTION 'Platform selected-tenant read escaped its scope';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.tms_review_driver_certification_secure(qa_ids[1], 'approved', NULL);
    RAISE EXCEPTION 'Platform selected-tenant review escaped its scope';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  PERFORM set_config('request.headers', '{}', true);

  -- Synthetic private object metadata is created only within this rollback
  -- fixture. No real identity image or approved status survives this test.
  FOREACH v_driver_id IN ARRAY qa_ids LOOP
    image_paths := ARRAY[
      qa_tenant::text || '/' || reviewer::text || '/' || gen_random_uuid()::text || '.png',
      qa_tenant::text || '/' || reviewer::text || '/' || gen_random_uuid()::text || '.png',
      qa_tenant::text || '/' || reviewer::text || '/' || gen_random_uuid()::text || '.png',
      qa_tenant::text || '/' || reviewer::text || '/' || gen_random_uuid()::text || '.png',
      qa_tenant::text || '/' || reviewer::text || '/' || gen_random_uuid()::text || '.png'
    ];
    FOREACH image_path IN ARRAY image_paths LOOP
      INSERT INTO storage.objects(bucket_id, name, owner, owner_id, metadata)
      VALUES ('tms-driver-private', image_path, reviewer, reviewer::text,
        '{"mimetype":"image/png"}'::jsonb);
    END LOOP;
    UPDATE public.mdm_driver SET
      id_card_front_url = image_paths[1],
      id_card_back_url = image_paths[2],
      driver_license_front_url = image_paths[3],
      driver_license_back_url = image_paths[4],
      license_expire_date = CURRENT_DATE + 365
    WHERE id = v_driver_id AND tenant_id = qa_tenant;
    UPDATE public.tms_driver_profile SET
      id_card_valid_to = CURRENT_DATE + 365,
      qualification_type = 'road_freight',
      qualification_no = 'QA-ROLLBACK-ONLY',
      qualification_valid_to = CURRENT_DATE + 365,
      qualification_front_url = image_paths[5]
    WHERE driver_id = v_driver_id AND tenant_id = qa_tenant;
    PERFORM public.tms_review_driver_certification_secure(v_driver_id, 'approved', NULL);
    PERFORM app_private.tms_assert_driver_certified(qa_tenant, v_driver_id, 'carrier');
  END LOOP;
  UPDATE public.tms_order
  SET dispatch_status = 'loaded', dispatch_driver_id = qa_ids[1]
  WHERE id = '9a9679c3-1b4e-4e01-8012-60b1087e0fb7';
  IF NOT EXISTS (SELECT 1 FROM public.tms_order
      WHERE id = '9a9679c3-1b4e-4e01-8012-60b1087e0fb7'
        AND dispatch_status = 'loaded' AND dispatch_driver_id = qa_ids[1]) THEN
    RAISE EXCEPTION 'Approved QA driver could not pass dispatch gate';
  END IF;
  PERFORM public.tms_accept_assigned_waybill(qa_waybills[1]);
  PERFORM public.tms_accept_assigned_waybill(qa_waybills[2]);
  IF (SELECT count(*) FROM public.tms_waybill
      WHERE id = ANY(qa_waybills) AND status = 'accepted') <> 2 THEN
    RAISE EXCEPTION 'Approved QA drivers could not accept both waybills';
  END IF;

  PERFORM public.tms_review_driver_certification_secure(
    qa_ids[1], 'revoked', '测试事务撤销认证');
  BEGIN
    PERFORM app_private.tms_assert_driver_certified(qa_tenant, qa_ids[1], 'carrier');
    RAISE EXCEPTION 'Revoked certification was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  UPDATE public.tms_driver_profile SET qualification_no = 'QA-CHANGED-AFTER-REVIEW'
  WHERE driver_id = qa_ids[2];
  BEGIN
    PERFORM app_private.tms_assert_driver_certified(qa_tenant, qa_ids[2], 'carrier');
    RAISE EXCEPTION 'Stale certification survived a document change';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END;
$test$;

ROLLBACK;

