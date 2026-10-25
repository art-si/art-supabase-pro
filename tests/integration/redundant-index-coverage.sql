-- Detect safely removable exact duplicates and nonunique indexes covered by a unique index.
-- Does not flag primary/unique constraints, replica identity, clustered indexes or dependencies.
-- This check reports candidates; it never removes schema objects.
begin;

do $test$
declare
  v_candidates text[];
begin
  select array_agg(distinct format('%I.%I', n.nspname, ci.relname)) into v_candidates
  from pg_index i
  join pg_index j on j.indrelid = i.indrelid and j.indexrelid <> i.indexrelid
  join pg_class t on t.oid = i.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_class ci on ci.oid = i.indexrelid
  join pg_class cj on cj.oid = j.indexrelid
  where n.nspname in ('public', 'app_private')
    and not i.indisunique and not i.indisprimary and not i.indisexclusion
    and not i.indisreplident and not i.indisclustered
    and i.indisvalid and i.indisready and j.indisvalid and j.indisready
    and (j.indisunique or i.indexrelid > j.indexrelid)
    and ci.relam = cj.relam
    and i.indnkeyatts = j.indnkeyatts and i.indnatts = j.indnatts
    and i.indkey::text = j.indkey::text
    and i.indclass::text = j.indclass::text
    and i.indcollation::text = j.indcollation::text
    and i.indoption::text = j.indoption::text
    and coalesce(pg_get_expr(i.indpred, i.indrelid), '') = coalesce(pg_get_expr(j.indpred, j.indrelid), '')
    and coalesce(pg_get_expr(i.indexprs, i.indrelid), '') = coalesce(pg_get_expr(j.indexprs, j.indrelid), '')
    and ci.reloptions is not distinct from cj.reloptions
    and ci.reltablespace = cj.reltablespace
    and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
    and not exists (
      select 1 from pg_depend d
      where d.refclassid = 'pg_class'::regclass and d.refobjid = i.indexrelid
    );

  if v_candidates is not null then
    raise exception '[index-coverage] Redundant candidates require review: %', v_candidates;
  end if;
end;
$test$;

rollback;
