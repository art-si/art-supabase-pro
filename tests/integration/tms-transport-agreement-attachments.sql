-- Transactional acceptance for ordinary agreement attachments; no row is retained.
begin;

do $test$
declare
  v_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  v_valid text;
  v_cross_tenant text;
begin
  select a.url into v_valid
  from public.sys_attachment a
  join storage.objects o on o.bucket_id='attachments'
    and o.name=a.storage_path||'/'||a.object_name
  where a.tenant_id=v_tenant and a.storage_mode='supabase'
    and a.storage_path like v_tenant::text||'/%'
  order by a.id limit 1;
  select a.url into v_cross_tenant
  from public.sys_attachment a
  join storage.objects o on o.bucket_id='attachments'
    and o.name=a.storage_path||'/'||a.object_name
  where a.tenant_id<>v_tenant and a.storage_mode='supabase'
    and a.storage_path like a.tenant_id::text||'/%'
  order by a.id limit 1;
  if v_valid is null or v_cross_tenant is null then
    raise exception '附件验收需要本租户和其他租户的真实附件';
  end if;
  perform set_config('app.tms_attachment_valid_url',v_valid,true);
  perform set_config('app.tms_attachment_cross_url',v_cross_tenant,true);
end;
$test$;

set local role authenticated;
select set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
select set_config('request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers','{}',true);

do $test$
declare
  v_draft uuid;
  v_valid text:=current_setting('app.tms_attachment_valid_url',true);
  v_cross_tenant text:=current_setting('app.tms_attachment_cross_url',true);
  v_fake text:='https://ckbftoopuyophiebamwy.supabase.co/storage/v1/object/public/attachments/7529f951-938e-4e2c-ac0d-316c136ae1f9/qa-nonexistent.png';
  v_rejected integer:=0;
begin
  insert into public.tms_transport_agreement
  select (jsonb_populate_record(null::public.tms_transport_agreement,
    to_jsonb(a)||jsonb_build_object(
      'id',gen_random_uuid(),
      'agreement_no',null,
      'approval_status','draft',
      'status','pending_signed',
      'party_a_signed_on',null,
      'party_b_signed_on',null,
      'attachments',jsonb_build_array()))).*
  from public.tms_transport_agreement a
  where a.agreement_no='YSXY202611-006'
  returning id into v_draft;
  if v_draft is null then raise exception '草稿夹具未创建'; end if;

  update public.tms_transport_agreement
  set attachments=array[v_valid]
  where id=v_draft;
  if not found or not exists(select 1 from public.tms_transport_agreement
      where id=v_draft and attachments=array[v_valid]) then
    raise exception '同租户真实附件未能写入草稿';
  end if;

  begin
    update public.tms_transport_agreement
    set attachments=array[v_cross_tenant]
    where id=v_draft;
    raise exception '跨租户附件被写入';
  exception when sqlstate '42501' then v_rejected:=v_rejected+1; end;
  begin
    update public.tms_transport_agreement
    set attachments=array[v_fake]
    where id=v_draft;
    raise exception '无真实对象的附件被写入';
  exception when sqlstate '42501' then v_rejected:=v_rejected+1; end;
  begin
    update public.tms_transport_agreement
    set attachments=array[v_valid]
    where agreement_no='YSXY202611-006';
    raise exception '已签协议的附件被修改';
  exception when sqlstate '42501' then v_rejected:=v_rejected+1; end;
  if v_rejected<>3 then raise exception '附件拒绝断言数量不匹配'; end if;
end;
$test$;
select 'agreement_attachments_passed' result;
rollback;
