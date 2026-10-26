BEGIN;

DO $test$
DECLARE
  record_row record;
  target_menu_id uuid;
  source_menu_id uuid;
  actual_grants integer;
  expected_grants integer;
BEGIN
  FOR record_row IN
    SELECT * FROM (VALUES
      ('TmsOrderQuery', 'TmsTransportation', 'order-query', '/tms/order-query', 'menu', false, 'TmsOrderList'),
      ('TmsOrderQueryDetail', 'TmsTransportation', 'order-query/detail/:id', '/tms/order-query/detail', 'menu', true, 'TmsOrderList'),
      ('TmsOrderQuery:View', 'TmsOrderQuery', '', '', 'button', false, 'TmsOrderList:View'),
      ('TmsOrderQuery:Export', 'TmsOrderQuery', '', '', 'button', false, 'TmsOrderList:Export'),
      ('TmsDriverQuery', 'TmsTransportation', 'driver-query', '/tms/driver-query', 'menu', false, 'TmsDriver'),
      ('TmsDriverQueryDetail', 'TmsTransportation', 'driver-query/detail/:id', '/tms/driver-query/detail', 'menu', true, 'TmsDriver'),
      ('TmsDriverQuery:View', 'TmsDriverQuery', '', '', 'button', false, 'TmsDriver'),
      ('TmsDriverQuery:Export', 'TmsDriverQuery', '', '', 'button', false, 'TmsDriver'),
      ('VehicleQuery:Export', 'VehicleQuery', '', '', 'button', false, 'VehicleQuery')
    ) AS expected(name, parent_name, path, component, menu_type, hidden, source_name)
  LOOP
    SELECT id INTO target_menu_id FROM public.sys_menu WHERE name = record_row.name;
    SELECT id INTO source_menu_id FROM public.sys_menu WHERE name = record_row.source_name;

    IF target_menu_id IS NULL OR source_menu_id IS NULL THEN
      RAISE EXCEPTION 'Mainline menu or inheritance source missing: %', record_row.name;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.sys_menu child
      JOIN public.sys_menu parent ON parent.id = child.parent_id
      WHERE child.id = target_menu_id
        AND parent.name = record_row.parent_name
        AND child.path IS NOT DISTINCT FROM record_row.path
        AND child.component IS NOT DISTINCT FROM record_row.component
        AND child.type = record_row.menu_type
        AND coalesce((child.meta->>'is_hide')::boolean, false) = record_row.hidden
        AND coalesce((child.meta->>'is_enable')::boolean, false)
    ) THEN
      RAISE EXCEPTION 'Mainline menu route, parent, or visibility mismatch: %', record_row.name;
    END IF;

    SELECT count(*) INTO actual_grants FROM public.sys_role_menu WHERE menu_id = target_menu_id;
    SELECT count(*) INTO expected_grants FROM public.sys_role_menu WHERE menu_id = source_menu_id;
    IF actual_grants <> expected_grants THEN
      RAISE EXCEPTION 'Mainline role count mismatch for %: % vs %', record_row.name, actual_grants, expected_grants;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.sys_role_menu granted
      JOIN public.sys_role role ON role.id = granted.role_id
      WHERE granted.menu_id = target_menu_id
        AND (
          granted.tenant_id <> role.tenant_id
          OR NOT EXISTS (
            SELECT 1 FROM public.sys_role_menu inherited
            WHERE inherited.menu_id = source_menu_id
              AND inherited.role_id = granted.role_id
              AND inherited.tenant_id = granted.tenant_id
          )
        )
    ) THEN
      RAISE EXCEPTION 'Mainline grant escaped its source role or tenant: %', record_row.name;
    END IF;
  END LOOP;
END;
$test$;

DO $screen$
DECLARE
  screen_menu_id uuid;
  screen_button_id uuid;
  monitor_menu_id uuid;
  order_view_id uuid;
  expected_grants integer;
  actual_grants integer;
BEGIN
  SELECT id INTO screen_menu_id FROM public.sys_menu WHERE name = 'TmsMainlineScreen';
  SELECT id INTO screen_button_id FROM public.sys_menu WHERE name = 'TmsMainlineScreen:View';
  SELECT id INTO monitor_menu_id FROM public.sys_menu WHERE name = 'TmsInTransitMonitor';
  SELECT id INTO order_view_id FROM public.sys_menu WHERE name = 'TmsOrderList:View';
  IF screen_menu_id IS NULL OR screen_button_id IS NULL
     OR monitor_menu_id IS NULL OR order_view_id IS NULL THEN
    RAISE EXCEPTION 'Mainline screen menu or source permission missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sys_menu screen
    JOIN public.sys_menu parent ON parent.id = screen.parent_id
    WHERE screen.id = screen_menu_id AND parent.name = 'TmsTransportation'
      AND screen.path = 'mainline-screen'
      AND screen.component = '/tms/mainline-screen'
      AND screen.type = 'menu'
      AND coalesce((screen.meta->>'is_hide')::boolean, false) = false
      AND coalesce((screen.meta->>'is_enable')::boolean, false)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.sys_menu action
    WHERE action.id = screen_button_id AND action.parent_id = screen_menu_id
      AND action.path = '' AND action.component = '' AND action.type = 'button'
      AND coalesce((action.meta->>'is_enable')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'Mainline screen route, parent, or view button mismatch';
  END IF;

  SELECT count(*) INTO expected_grants
  FROM public.sys_role_menu monitor_grant
  JOIN public.sys_role_menu order_grant
    ON order_grant.role_id = monitor_grant.role_id
   AND order_grant.tenant_id = monitor_grant.tenant_id
  WHERE monitor_grant.menu_id = monitor_menu_id
    AND order_grant.menu_id = order_view_id;
  FOREACH screen_menu_id IN ARRAY ARRAY[screen_menu_id, screen_button_id] LOOP
    SELECT count(*) INTO actual_grants
    FROM public.sys_role_menu WHERE menu_id = screen_menu_id;
    IF actual_grants <> expected_grants OR EXISTS (
      SELECT 1 FROM public.sys_role_menu screen_grant
      WHERE screen_grant.menu_id = screen_menu_id
        AND NOT EXISTS (
          SELECT 1 FROM public.sys_role_menu monitor_grant
          JOIN public.sys_role_menu order_grant
            ON order_grant.role_id = monitor_grant.role_id
           AND order_grant.tenant_id = monitor_grant.tenant_id
          WHERE monitor_grant.menu_id = monitor_menu_id
            AND order_grant.menu_id = order_view_id
            AND monitor_grant.role_id = screen_grant.role_id
            AND monitor_grant.tenant_id = screen_grant.tenant_id
        )
    ) THEN
      RAISE EXCEPTION 'Mainline screen grant escaped source-role intersection';
    END IF;
  END LOOP;
END;
$screen$;

ROLLBACK;
