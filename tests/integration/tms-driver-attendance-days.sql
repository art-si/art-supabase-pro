BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
DO $test$
DECLARE rows jsonb;
BEGIN
 rows:=public.tms_management_report('driver-productivity','2026-09-01','2026-09-30','报表验收',0,200)->'records';
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'label'='报表验收司机1' AND (j->>'attendance_days')::int=1 AND (j->>'attendance_pending_days')::int=0) THEN RAISE EXCEPTION 'Clear attendance day missing: %',rows; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'label'='报表验收司机2' AND (j->>'attendance_days')::int=0 AND (j->>'attendance_pending_days')::int=1) THEN RAISE EXCEPTION 'Pending day counted as clear attendance: %',rows; END IF;
 rows:=public.tms_management_report('driver-productivity','2026-10-01','2026-10-31','报表验收',0,200)->'records';
 IF jsonb_array_length(rows)<>2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'attendance_days' IS NOT NULL) THEN RAISE EXCEPTION 'Missing attendance guessed as zero'; END IF;
END $test$;
RESET ROLE;
DELETE FROM public.sys_role_menu WHERE menu_id IN (SELECT id FROM public.sys_menu WHERE name='Hr:Attendance:View');
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rows jsonb;
BEGIN
 rows:=public.tms_management_report('driver-productivity','2026-09-01','2026-09-30','报表验收',0,200)->'records';
 IF jsonb_array_length(rows)<>2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'attendance_days' IS NOT NULL OR j->>'attendance_pending_days' IS NOT NULL OR j->>'attendance_recorded_days' IS NOT NULL) THEN RAISE EXCEPTION 'Attendance metrics leaked without permission'; END IF;
END $test$;
ROLLBACK;
