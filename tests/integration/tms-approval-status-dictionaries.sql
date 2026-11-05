-- The shared TMS approval dictionaries must be readable by ordinary tenant users.
BEGIN;
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', 'ab881b32-87d4-4dce-9014-ce488b8069df', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',
  true
);
SELECT set_config('request.headers', '{}', true);

DO $test$
DECLARE
  actual_count integer;
  matched_count integer;
BEGIN
  SELECT count(*) INTO actual_count
  FROM public.sys_dict_type t
  JOIN public.sys_dict_type p ON p.id = t.parent_id
  JOIN public.sys_dictionary d ON d.type_id = t.id
  WHERE t.code IN (
    'tmsElectronicContractApprovalStatus',
    'tmsTransportAgreementApprovalStatus'
  )
    AND t.status = '1'
    AND d.status = '1'
    AND t.node_type = 'dictionary'
    AND p.node_type = 'directory'
    AND t.tenant_id = app_private.platform_tenant_id()
    AND d.tenant_id = t.tenant_id;

  WITH expected(code, parent_code, value, label, tag_type) AS (
    VALUES
      ('tmsElectronicContractApprovalStatus', 'tmsElectronicContract', 'draft', '草稿', 'info'),
      ('tmsElectronicContractApprovalStatus', 'tmsElectronicContract', 'pending', '审批中', 'warning'),
      ('tmsElectronicContractApprovalStatus', 'tmsElectronicContract', 'approved', '已通过', 'success'),
      ('tmsElectronicContractApprovalStatus', 'tmsElectronicContract', 'rejected', '已驳回', 'danger'),
      ('tmsTransportAgreementApprovalStatus', 'tmsTransportAgreement', 'draft', '草稿', 'info'),
      ('tmsTransportAgreementApprovalStatus', 'tmsTransportAgreement', 'pending', '审批中', 'warning'),
      ('tmsTransportAgreementApprovalStatus', 'tmsTransportAgreement', 'approved', '已通过', 'success'),
      ('tmsTransportAgreementApprovalStatus', 'tmsTransportAgreement', 'rejected', '已驳回', 'danger')
  )
  SELECT count(*) INTO matched_count
  FROM expected e
  JOIN public.sys_dict_type t ON t.code = e.code AND t.status = '1'
  JOIN public.sys_dict_type p ON p.id = t.parent_id AND p.code = e.parent_code
  JOIN public.sys_dictionary d ON d.type_id = t.id
    AND d.value = e.value AND d.label = e.label AND d.tag_type = e.tag_type
    AND d.status = '1';

  IF actual_count <> 8 OR matched_count <> 8 THEN
    RAISE EXCEPTION 'TMS approval dictionaries are missing, misplaced, or unreadable';
  END IF;
END;
$test$;

ROLLBACK;
