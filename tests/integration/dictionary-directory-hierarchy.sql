-- Dictionary types belong to functional leaf directories, below their application root.
begin;

do $test$
declare
  invalid_nodes text;
  reachable_nodes bigint;
begin
  select string_agg(t.code, ', ' order by t.code)
    into invalid_nodes
  from public.sys_dict_type t
  left join public.sys_dict_type p on p.id = t.parent_id
  where t.node_type = 'dictionary'
    and (p.id is null or p.node_type <> 'directory' or p.parent_id is null);
  if invalid_nodes is not null then
    raise exception 'Dictionary types outside functional directories: %', invalid_nodes;
  end if;

  select string_agg(t.code, ', ' order by t.code)
    into invalid_nodes
  from public.sys_dict_type t
  where t.node_type = 'dictionary'
    and exists (
      select 1 from public.sys_dict_type sibling
      where sibling.parent_id = t.parent_id and sibling.node_type = 'directory'
    );
  if invalid_nodes is not null then
    raise exception 'Dictionary types mixed with nested business directories: %', invalid_nodes;
  end if;

  select string_agg(t.code, ', ' order by t.code)
    into invalid_nodes
  from public.sys_dict_type t
  left join public.sys_dict_type p on p.id = t.parent_id
  where t.parent_id is not null
    and (p.id is null or p.node_type <> 'directory' or p.tenant_id <> t.tenant_id);
  if invalid_nodes is not null then
    raise exception 'Orphaned, non-directory or cross-tenant parents: %', invalid_nodes;
  end if;

  with recursive hierarchy as (
    select id, array[id] as path
    from public.sys_dict_type where parent_id is null
    union all
    select t.id, h.path || t.id
    from public.sys_dict_type t
    join hierarchy h on h.id = t.parent_id
    where not t.id = any(h.path)
  )
  select count(*) into reachable_nodes from hierarchy;
  if reachable_nodes <> (select count(*) from public.sys_dict_type) then
    raise exception 'Dictionary hierarchy contains a cycle or unreachable nodes';
  end if;
end $test$;

rollback;
