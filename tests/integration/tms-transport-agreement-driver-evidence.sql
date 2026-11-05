-- All certification images and status changes in this test are synthetic and rolled back.
-- Private Storage rows are synthetic metadata; the real URL/GET check is separate.
begin;

do $test$
declare
  reviewer uuid;
  tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  qa_driver_id uuid := 'a9fc0003-1023-4620-9220-000000000001';
  qa_vehicle_id uuid := '2044df5f-2803-4a3f-b478-cbc2aafab6e3';
  paths text[];
  item text;
begin
  select auth_user_id into reviewer from public.sys_user
    where user_roles @> array['R_SUPER'] and auth_user_id is not null limit 1;
  if reviewer is null then raise exception '验收审核人不存在'; end if;
  if not exists (select 1 from public.mdm_driver d join public.vehicle_archive v
      on v.tenant_id=d.tenant_id and v.carrier_id=d.carrier_id
      where d.id=qa_driver_id and v.id=qa_vehicle_id and d.tenant_id=tenant) then
    raise exception '验收司机与车辆的租户或承运商关系已变化';
  end if;
  perform set_config('request.jwt.claim.sub',reviewer::text,true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  paths:=array[
    tenant::text||'/'||reviewer::text||'/'||gen_random_uuid()::text||'.png',
    tenant::text||'/'||reviewer::text||'/'||gen_random_uuid()::text||'.png',
    tenant::text||'/'||reviewer::text||'/'||gen_random_uuid()::text||'.png',
    tenant::text||'/'||reviewer::text||'/'||gen_random_uuid()::text||'.png',
    tenant::text||'/'||reviewer::text||'/'||gen_random_uuid()::text||'.png',
    tenant::text||'/'||reviewer::text||'/'||gen_random_uuid()::text||'.png',
    tenant::text||'/'||reviewer::text||'/'||gen_random_uuid()::text||'.png',
    tenant::text||'/'||reviewer::text||'/'||gen_random_uuid()::text||'.png'
  ];
  foreach item in array paths[1:5] loop
    insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
    values('tms-driver-private',item,reviewer,reviewer::text,
      '{"mimetype":"image/png"}'::jsonb);
  end loop;
  foreach item in array paths[6:8] loop
    insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
    values('vms-vehicle-private',item,reviewer,reviewer::text,
      '{"mimetype":"image/png"}'::jsonb);
  end loop;
  update public.mdm_driver set
    id_card_front_url=paths[1],id_card_back_url=paths[2],
    driver_license_front_url=paths[3],driver_license_back_url=paths[4],
    license_expire_date=current_date+365
    where id=qa_driver_id and tenant_id=tenant;
  update public.tms_driver_profile set
    id_card_valid_to=current_date+365,
    qualification_type='road_freight',qualification_no='QA-ROLLBACK-ONLY',
    qualification_valid_to=current_date+365,
    qualification_front_url=paths[5]
    where driver_id=qa_driver_id and tenant_id=tenant;
  perform public.tms_review_driver_certification_secure(qa_driver_id,'approved',null);
  perform app_private.tms_assert_driver_certified(tenant,qa_driver_id,'carrier');
  -- Synthetic vehicle approval is confined to this rollback-only transaction.
  perform set_config('app.workflow_engine','on',true);
  update public.vehicle_archive set
    audit_status='approved',
    driving_license_front_url=paths[6],
    driving_license_back_url=paths[7],
    operation_license_url=paths[8]
    where id=qa_vehicle_id and tenant_id=tenant;
  if not found then raise exception '验收车辆未更新'; end if;
  perform set_config('app.workflow_engine','',true);
  perform set_config('app.tms_evidence_test_paths',to_jsonb(paths)::text,true);
end;
$test$;

set local role authenticated;
select set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
select set_config('request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers','{}',true);

do $test$
declare
  evidence jsonb;
  paths text[];
  rejected integer:=0;
  reviewer uuid;
begin
  paths:=array(select jsonb_array_elements_text(
    current_setting('app.tms_evidence_test_paths',true)::jsonb));
  evidence:=public.tms_get_agreement_driver_evidence_secure(
    'a9fc0003-1023-4620-9220-000000000001',
    '2044df5f-2803-4a3f-b478-cbc2aafab6e3');
  if jsonb_array_length(evidence->'idCardImages')<>2
    or jsonb_array_length(evidence->'driverLicenseImages')<>2
    or jsonb_array_length(evidence->'registrationImages')<>2
    or jsonb_array_length(evidence->'roadPermitImages')<>2
    or not ((evidence->'idCardImages') ? paths[1])
    or not ((evidence->'driverLicenseImages') ? paths[3])
    or not ((evidence->'registrationImages') ? paths[6])
    or not ((evidence->'roadPermitImages') ? paths[8])
    or not ((evidence->'roadPermitImages') ? paths[5]) then
    raise exception '已认证司机或所选车辆的四类证照未正确自动带入';
  end if;

  evidence:=public.tms_get_agreement_driver_evidence_secure(
    'a9fc0003-1023-4620-9220-000000000002',
    null);
  if jsonb_array_length(evidence->'idCardImages')<>0
    or jsonb_array_length(evidence->'driverLicenseImages')<>0 then
    raise exception '未认证司机的身份证或驾驶证被错误带入';
  end if;
  begin
    perform public.tms_get_agreement_driver_evidence_secure(
      'a9fc0003-1023-4620-9220-000000000001',
      'd7670b37-2283-433e-95d2-7315829b0edc');
    raise exception '不同承运商的车辆证照被带入';
  exception when sqlstate '42501' then rejected:=rejected+1; end;
  begin
    perform public.tms_get_agreement_driver_evidence_secure(
      'a5c1886b-4a8d-4ffd-8fe0-ecf3c2f017fb',null);
    raise exception '跨租户司机证照被读取';
  exception when sqlstate '42501' then rejected:=rejected+1; end;
  if rejected<>2 then raise exception '跨归属拒绝数量错误'; end if;
end;
$test$;

reset role;
do $test$
declare reviewer uuid;
begin
  select auth_user_id into reviewer from public.sys_user
    where user_roles @> array['R_SUPER'] and auth_user_id is not null limit 1;
  perform set_config('request.jwt.claim.sub',reviewer::text,true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);
  perform public.tms_review_driver_certification_secure(
    'a9fc0003-1023-4620-9220-000000000001','revoked','回滚验收撤销');
end;
$test$;

set local role authenticated;
select set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
select set_config('request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
do $test$
declare evidence jsonb;
begin
  evidence:=public.tms_get_agreement_driver_evidence_secure(
    'a9fc0003-1023-4620-9220-000000000001',
    '2044df5f-2803-4a3f-b478-cbc2aafab6e3');
  if jsonb_array_length(evidence->'idCardImages')<>0
    or jsonb_array_length(evidence->'driverLicenseImages')<>0 then
    raise exception '已撤销认证的司机证照仍被带入新协议';
  end if;
end;
$test$;
select 'driver_evidence_passed' result;
rollback;
