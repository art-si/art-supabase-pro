BEGIN;

DO $test$
DECLARE
  target_ids uuid[] := ARRAY[
    'd7670b37-2283-433e-95d2-7315829b0edc'::uuid,
    'ccbfc1d7-b063-4d14-a7c5-11883547dd9d'::uuid,
    '7a3d9ca0-7a71-4c41-a8da-c67a2951ba0f'::uuid
  ];
  field_count integer;
BEGIN
  IF (SELECT count(*) FROM public.mdm_vehicle WHERE id=ANY(target_ids))<>3 THEN
    RAISE EXCEPTION 'Legacy VMS fixture vehicle missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.mdm_vehicle v
    WHERE v.id=ANY(target_ids)
      AND (v.driving_license_front_url LIKE '%/storage/v1/object/public/%'
        OR v.driving_license_back_url LIKE '%/storage/v1/object/public/%'
        OR v.operation_license_url LIKE '%/storage/v1/object/public/%')
  ) THEN RAISE EXCEPTION 'Targeted vehicle document still references public Storage'; END IF;
  WITH fields AS (
    SELECT v.tenant_id, entry.value AS path
    FROM public.mdm_vehicle v
    CROSS JOIN LATERAL (VALUES
      (v.driving_license_front_url),
      (v.driving_license_back_url),
      (v.operation_license_url)
    ) entry(value)
    WHERE v.id=ANY(target_ids)
  )
  SELECT count(*) INTO field_count FROM fields f
  JOIN storage.objects o ON o.bucket_id='vms-vehicle-private' AND o.name=f.path
  WHERE app_private.vms_certificate_private_path_valid(f.path)
    AND split_part(f.path,'/',1)=f.tenant_id::text
    AND o.owner_id=split_part(f.path,'/',2)
    AND o.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp');
  IF field_count<>9 THEN RAISE EXCEPTION 'Private vehicle document path, owner or object mismatch'; END IF;
END;
$test$;

ROLLBACK;
