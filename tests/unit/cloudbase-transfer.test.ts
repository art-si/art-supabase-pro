import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  splitPostgresStatements,
  transformData,
  transformSchema,
  transformStorageMetadata
} from '../../scripts/prepare-cloudbase-transfer'

test('splits PostgreSQL functions without treating dollar-quoted semicolons as boundaries', () => {
  const statements = splitPostgresStatements(`
CREATE FUNCTION public.example() RETURNS void AS $$
BEGIN
  PERFORM 'a;b';
END;
$$ LANGUAGE plpgsql;
SELECT 1;
`)
  assert.equal(statements.length, 2)
  assert.match(statements[0], /PERFORM 'a;b';/u)
})

test('prepares CloudBase schema while preserving UUID business identity semantics', () => {
  const result = transformSchema(`
CREATE SCHEMA IF NOT EXISTS "app_private";
ALTER SCHEMA "app_private" OWNER TO "postgres";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";
CREATE FUNCTION "app_private"."current_user"() RETURNS uuid AS $$
  SELECT auth.uid();
$$ LANGUAGE sql;
-- Name: notify(); Type: FUNCTION
CREATE FUNCTION "app_private"."notify"() RETURNS void AS $$
  SELECT net.http_post('https://example.invalid');
$$ LANGUAGE sql;
ALTER FUNCTION "app_private"."notify"() OWNER TO "postgres";
ALTER TABLE ONLY "public"."example"
  ADD CONSTRAINT "example_user_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");
CREATE TRIGGER "sys_user_after_delete_sync_auth_user" AFTER DELETE ON "public"."sys_user" FOR EACH ROW EXECUTE FUNCTION "app_private"."sync_delete_auth_user_on_app_delete"();
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."example";
SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES TO "authenticated";
`)
  assert.match(result.sql, /FUNCTION "app_private"\."auth_uid_uuid"/u)
  assert.match(result.sql, /SELECT app_private\.auth_uid_uuid\(\)/u)
  assert.doesNotMatch(result.sql, /CREATE EXTENSION/u)
  assert.doesNotMatch(result.sql, /net\.http_post/u)
  assert.doesNotMatch(result.sql, /REFERENCES "auth"\."users"/u)
  assert.doesNotMatch(result.sql, /sys_user_after_delete_sync_auth_user/u)
  assert.doesNotMatch(result.sql, /ALTER PUBLICATION/u)
  assert.doesNotMatch(result.sql, /SESSION AUTHORIZATION/u)
  assert.doesNotMatch(result.sql, /ALTER DEFAULT PRIVILEGES/u)
  assert.equal(result.report.skippedAuthForeignKeys, 1)
  assert.equal(result.report.skippedAuthDeleteTriggers, 1)
  assert.equal(result.report.skippedRealtimeStatements, 1)
  assert.equal(result.report.skippedSessionAuthorizationStatements, 2)
  assert.equal(result.report.skippedDefaultPrivilegeStatements, 1)
  assert.deepEqual(result.report.skippedExtensions, ['pg_net'])
  assert.deepEqual(result.report.skippedFunctions, ['"app_private"."notify"'])
})

test('preserves tenant authorization while accepting the CloudBase CORS metadata header', () => {
  const result = transformSchema(`
CREATE SCHEMA IF NOT EXISTS "app_private";
CREATE FUNCTION "app_private"."tenant_scope"() RETURNS text AS $$
BEGIN
  IF NOT app_private.is_platform_super() THEN
    RETURN app_private.auth_user_tenant_id()::text;
  END IF;
  RETURN current_setting('request.headers', true)::jsonb ->> 'x-art-tenant-scope';
END;
$$ LANGUAGE plpgsql;
CREATE FUNCTION "app_private"."set_scope"() RETURNS text AS $$
  SELECT jsonb_build_object('x-art-tenant-scope', 'scope')::text;
$$ LANGUAGE sql;
`)
  assert.match(result.sql, /IF NOT app_private\.is_platform_super\(\) THEN/u)
  assert.match(result.sql, /RETURN app_private\.auth_user_tenant_id\(\)::text/u)
  assert.match(
    result.sql,
    /coalesce\(current_setting\('request\.headers', true\)::jsonb ->> 'x-art-tenant-scope', current_setting\('request\.headers', true\)::jsonb ->> 'x-metadata'\)/u
  )
  assert.match(result.sql, /jsonb_build_object\('x-art-tenant-scope', 'scope'\)/u)
})

test('converts COPY blocks to bounded INSERT statements and excludes managed schemas', () => {
  const result = transformData(
    `COPY "public"."example" ("id", "label", "optional") FROM stdin;
1\tO'Reilly\\nGuide\t\\N
2\tSecond\tvalue
\\.
COPY "auth"."users" ("id", "email") FROM stdin;
user-1\tperson@example.com
\\.
`,
    { maxRows: 1 }
  )
  assert.equal(result.report.copiedTables, 1)
  assert.equal(result.report.copiedRows, 2)
  assert.equal(result.report.insertStatements, 2)
  assert.equal(result.report.skippedTables['"auth"."users"'], 1)
  assert.match(result.sql, /OVERRIDING SYSTEM VALUE/u)
  assert.match(result.sql, /O''Reilly\nGuide/u)
  assert.match(result.sql, /NULL/u)
  assert.doesNotMatch(result.sql, /person@example\.com/u)
})

test('prepares Storage owner and user metadata updates without replacing system metadata', () => {
  const result =
    transformStorageMetadata(`COPY "storage"."objects" ("id", "bucket_id", "name", "owner", "created_at", "updated_at", "last_accessed_at", "metadata", "version", "owner_id", "user_metadata") FROM stdin;
00000000-0000-0000-0000-000000000001\tattachments\ttenant/file.png\t00000000-0000-0000-0000-000000000002\t2026-01-01 00:00:00+00\t2026-01-02 00:00:00+00\t2026-01-03 00:00:00+00\t{"size":10}\tv1\t\\N\t{"label":"proof"}
\\.
`)
  assert.equal(result.report.metadataUpdates, 1)
  assert.match(result.sql, /owner_id = '00000000-0000-0000-0000-000000000002'/u)
  assert.match(result.sql, /user_metadata = '\{"label":"proof"\}'::jsonb/u)
  assert.doesNotMatch(result.sql, /(?:SET|,) metadata =/u)
  assert.doesNotMatch(result.sql, /version =/u)
})
