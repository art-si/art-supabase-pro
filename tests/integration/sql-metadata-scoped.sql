BEGIN;

DO $contract$
BEGIN
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.get_sql_console_metadata_scoped(text,jsonb,text,text)'::regprocedure)
 OR has_function_privilege('anon','public.get_sql_console_metadata_scoped(text,jsonb,text,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.get_sql_console_metadata_scoped(text,jsonb,text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'scoped metadata invoker/execute contract violated';
 END IF;
 IF to_regprocedure('public.get_sql_console_metadata()') IS NULL THEN RAISE EXCEPTION 'legacy full RPC missing';END IF;
END $contract$;

CREATE SCHEMA metadata_acl_test;
CREATE TABLE metadata_acl_test.denied(id integer PRIMARY KEY, secret text);
CREATE TABLE metadata_acl_test.allowed(id integer PRIMARY KEY REFERENCES metadata_acl_test.denied(id), searchable text);
CREATE TABLE metadata_acl_test.child_allowed(parent_id integer REFERENCES metadata_acl_test.allowed(id));
COMMENT ON COLUMN metadata_acl_test.allowed.searchable IS 'unloaded-column-needle';
COMMENT ON COLUMN metadata_acl_test.denied.secret IS 'unloaded-column-needle';
CREATE FUNCTION metadata_acl_test.allowed_fn() RETURNS integer LANGUAGE sql AS 'select 1';
CREATE FUNCTION metadata_acl_test.denied_fn() RETURNS integer LANGUAGE sql AS 'select 2';
REVOKE ALL ON FUNCTION metadata_acl_test.denied_fn() FROM PUBLIC;
GRANT USAGE ON SCHEMA metadata_acl_test TO authenticated;
GRANT SELECT ON metadata_acl_test.allowed TO authenticated;
GRANT SELECT ON metadata_acl_test.child_allowed TO authenticated;
GRANT EXECUTE ON FUNCTION metadata_acl_test.allowed_fn() TO authenticated;
CREATE SCHEMA metadata_empty_test;
GRANT USAGE ON SCHEMA metadata_empty_test TO authenticated;
CREATE FUNCTION metadata_empty_test.only_function() RETURNS integer LANGUAGE sql AS 'select 1';
GRANT EXECUTE ON FUNCTION metadata_empty_test.only_function() TO authenticated;
SET LOCAL ROLE authenticated;
DO $assert$
DECLARE c jsonb;d jsonb;s jsonb;f jsonb;
BEGIN
 c:=public.get_sql_console_metadata_scoped('catalog');
 IF c->>'metadataMode'<>'catalog' OR NOT (c->'schemas' ? 'metadata_empty_test') THEN RAISE EXCEPTION 'catalog mode or function-only/empty schema missing';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'tables') t WHERE t->>'tableSchema'='metadata_acl_test' AND t->>'tableName'='allowed' AND t->>'detailsLoaded'='false' AND t->>'columnCount'='2') OR EXISTS(SELECT 1 FROM jsonb_array_elements(c->'tables') t WHERE t->>'tableSchema'='metadata_acl_test' AND t->>'tableName'='denied') THEN RAISE EXCEPTION 'catalog privilege mismatch'; END IF;
 IF jsonb_array_length(c->'columns')<>0 OR jsonb_array_length(c->'foreignKeys')<>0 OR jsonb_array_length(c->'functions')<>0 THEN RAISE EXCEPTION 'catalog loaded heavy details';END IF;
 d:=public.get_sql_console_metadata_scoped('tables','[{"schema":"metadata_acl_test","name":"allowed"},{"schema":"metadata_acl_test","name":"denied"}]');
 IF jsonb_array_length(d->'tables')<>1 OR jsonb_array_length(d->'columns')<>2 OR jsonb_array_length(d->'foreignKeys')<>1 OR d->'tables'->0->>'detailsLoaded'<>'true' THEN RAISE EXCEPTION 'table detail privilege/FK target mismatch';END IF;
 IF d->'foreignKeys'->0->>'sourceTable'<>'child_allowed' OR d->'foreignKeys'->0->>'targetTable'<>'allowed' THEN RAISE EXCEPTION 'incoming FK missing or denied target leaked';END IF;
 s:=public.get_sql_console_metadata_scoped('search','[]','metadata_acl_test','unloaded-column-needle');
 IF jsonb_array_length(s->'tables')<>1 OR s->'tables'->0->'matchedColumns'->>0<>'searchable' THEN RAISE EXCEPTION 'server column search failed';END IF;
 f:=public.get_sql_console_metadata_scoped('functions','[]','metadata_acl_test');
 IF jsonb_array_length(f->'functions')<>1 OR f->'functions'->0->>'routineName'<>'allowed_fn' THEN RAISE EXCEPTION 'function privilege mismatch';END IF;
 IF jsonb_array_length(public.get_sql_console_metadata_scoped('search','[]',NULL,'%;SELECT secret')->'tables')<>0 THEN RAISE EXCEPTION 'search identifier injection';END IF;
 BEGIN PERFORM public.get_sql_console_metadata_scoped('tables','[{}]');RAISE EXCEPTION 'invalid table input accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.get_sql_console_metadata_scoped('tables',(SELECT jsonb_agg(jsonb_build_object('schema','metadata_acl_test','name','allowed')) FROM generate_series(1,33)));RAISE EXCEPTION 'table cap not enforced';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 s:=public.get_sql_console_metadata_scoped('search','[]',NULL,'a');
 IF jsonb_array_length(s->'tables')>100 OR jsonb_array_length(s->'functions')>100 THEN RAISE EXCEPTION 'search cap not enforced';END IF;
END $assert$;
SELECT 'scoped metadata permission, detail, search and validation assertions passed' AS result;
ROLLBACK;

