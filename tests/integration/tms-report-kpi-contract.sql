BEGIN;
DO $test$
DECLARE result jsonb; expected record; actual jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  result := public.tms_management_report('operations-kpi','2026-09-01','2026-09-30','报表验收',0,20);
  IF jsonb_array_length(result->'records') <> 6 THEN
    RAISE EXCEPTION 'Expected all six operational KPIs';
  END IF;
  -- Expectations come from the two September execution fixtures, not another report.
  FOR expected IN SELECT * FROM (VALUES
    ('loading',50::numeric,58.82::numeric,'≥85%','未达标'),
    ('empty',15,66.67,'≤10%','预警'),
    ('punctual',100,102.04,'≥98%','达标'),
    ('damage',1.5,6.67,'≤0.1%','未达标'),
    ('receipt',50,52.63,'≥95%','未达标'),
    ('turnover',NULL,NULL,'≤45天','待核算')
  ) v(code,value,completion,target,warning) LOOP
    SELECT j INTO STRICT actual FROM jsonb_array_elements(result->'records') j
    WHERE j->>'code'=expected.code;
    IF (actual->>'actual')::numeric IS DISTINCT FROM expected.value
      OR (actual->>'completion')::numeric IS DISTINCT FROM expected.completion
      OR actual->>'target' IS DISTINCT FROM expected.target
      OR actual->>'warning' IS DISTINCT FROM expected.warning THEN
      RAISE EXCEPTION 'KPI contract mismatch: % %',expected.code,actual;
    END IF;
  END LOOP;
  IF (result->'summary'->>'available')::int <> 5
    OR (result->'summary'->>'pending')::int <> 1
    OR (result->'summary'->>'achieved')::int <> 1 THEN
    RAISE EXCEPTION 'KPI headline counts differ from the six metrics';
  END IF;
END $test$;
ROLLBACK;
