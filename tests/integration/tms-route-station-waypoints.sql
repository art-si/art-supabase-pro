-- Scoped project regression. Uses one existing route and one same-tenant transfer station; rolls back.
BEGIN;

DO $fixture$
DECLARE v_route uuid; v_station uuid;
BEGIN
  SELECT f.id,s.id INTO v_route,v_station
  FROM public.tms_favorite_route f
  JOIN public.mdm_station s ON s.tenant_id=f.tenant_id AND s.enabled
  JOIN public.tms_station_role role_row ON role_row.station_id=s.id AND role_row.role_type='transfer'
  ORDER BY f.id,s.id LIMIT 1;
  IF v_route IS NULL OR v_station IS NULL THEN RAISE EXCEPTION 'Route/station waypoint fixture is missing'; END IF;
  PERFORM set_config('app.route_fixture_id',v_route::text,true);
  PERFORM set_config('app.station_fixture_id',v_station::text,true);
  IF NOT EXISTS (SELECT 1 FROM public.sys_dictionary d JOIN public.sys_dict_type t ON t.id=d.type_id
    WHERE t.code='tmsStationType' AND d.value='transfer' AND d.label='途经点')
  THEN RAISE EXCEPTION 'Transfer station label should be 途经点 without changing its code'; END IF;
END $fixture$;

UPDATE public.tms_favorite_route
SET waypoint_station_ids=ARRAY[current_setting('app.station_fixture_id')::uuid],return_trip=true
WHERE id=current_setting('app.route_fixture_id')::uuid;
DO $assert_route$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tms_favorite_route
    WHERE id=current_setting('app.route_fixture_id')::uuid
      AND cardinality(waypoint_station_ids)=1 AND return_trip)
  THEN RAISE EXCEPTION 'Ordered waypoint or return trip was not saved'; END IF;
  BEGIN
    UPDATE public.tms_favorite_route
    SET waypoint_station_ids=ARRAY[current_setting('app.station_fixture_id')::uuid,current_setting('app.station_fixture_id')::uuid]
    WHERE id=current_setting('app.route_fixture_id')::uuid;
    RAISE EXCEPTION 'Duplicate waypoint was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    UPDATE public.tms_favorite_route
    SET waypoint_station_ids=ARRAY[
      current_setting('app.station_fixture_id')::uuid,current_setting('app.station_fixture_id')::uuid,
      current_setting('app.station_fixture_id')::uuid,current_setting('app.station_fixture_id')::uuid
    ] WHERE id=current_setting('app.route_fixture_id')::uuid;
    RAISE EXCEPTION 'Four waypoints were accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    DELETE FROM public.mdm_station WHERE id=current_setting('app.station_fixture_id')::uuid;
    RAISE EXCEPTION 'Referenced waypoint station was deleted';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    IF SQLERRM NOT LIKE '站点仍被常用线路用作途经点%' THEN RAISE; END IF;
  END;
END $assert_route$;

-- Guard detail gives the route name and authorized navigation to a signed-in manager.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
DO $guard_detail$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.get_tms_station_delete_dependency_details(
      ARRAY[current_setting('app.station_fixture_id')::uuid]
    ) d
    WHERE d.dependency_code='station_favorite_route'
      AND d.record_id=current_setting('app.route_fixture_id')::uuid
      AND d.record_no IS NOT NULL AND d.record_status IS NOT NULL
  ) THEN RAISE EXCEPTION 'Station delete guard lost linked route details'; END IF;
END $guard_detail$;
RESET ROLE;

-- The address picker persists one coordinate pair; an incomplete pair is rejected.
UPDATE public.mdm_station
SET region='浙江省/杭州市/西湖区',address_detail='测试路 1 号',
    longitude=120.1234567,latitude=30.1234567,coordinate_system='gcj02'
WHERE id=current_setting('app.station_fixture_id')::uuid;
DO $geo$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.mdm_station
    WHERE id=current_setting('app.station_fixture_id')::uuid
      AND region='浙江省/杭州市/西湖区' AND address_detail='测试路 1 号'
      AND longitude=120.1234567 AND latitude=30.1234567)
  THEN RAISE EXCEPTION 'Station address/coordinate values did not persist'; END IF;
  BEGIN
    UPDATE public.mdm_station SET latitude=NULL WHERE id=current_setting('app.station_fixture_id')::uuid;
    RAISE EXCEPTION 'Incomplete station coordinate pair was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END $geo$;

ROLLBACK;
