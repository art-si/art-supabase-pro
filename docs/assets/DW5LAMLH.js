import{r as e}from"./C0FnF6B9.js";import{at as t,it as n,rt as r}from"./BN2mnf3W.js";import"./Bo38f8tF.js";import{t as i}from"./Cnvag3iz.js";import{r as a}from"./CYrkJq8D.js";import{n as o}from"./BdFY6rhL.js";var s=e({addDict:()=>j,addDictType:()=>x,deleteDict:()=>k,deleteDictBatch:()=>A,deleteDictType:()=>b,deleteResource:()=>F,editDict:()=>M,editDictType:()=>S,executeSql:()=>R,fetchDatabaseMetadata:()=>I,fetchDictTypeIdByDictionaryId:()=>T,fetchDictionaryDirectoryTree:()=>y,fetchDictionaryDisplayItem:()=>O,fetchDictionaryList:()=>E,fetchDictionaryListByTypeCode:()=>D,fetchDictionaryListByTypeId:()=>w,fetchDictionaryTypeList:()=>_,fetchDictionaryTypeOptions:()=>v,fetchResourceList:()=>N,generateSqlByAi:()=>z,renameResource:()=>P,saveDictTypeTreeOrder:()=>C}),{supabase:c,keysToSnakeDeep:l,responseHandle:u}=t(),d=500,f=new o({idKey:`id`,parentKey:`parentId`,childrenKey:`children`});function p(e){if(!e||typeof e!=`object`||Array.isArray(e))return!1;let t=e;return typeof t.tableSchema==`string`&&typeof t.tableName==`string`&&typeof t.columnName==`string`&&typeof t.dataType==`string`&&typeof t.isNullable==`string`&&typeof t.ordinalPosition==`number`}function m(e){if(!e||typeof e!=`object`||Array.isArray(e))return!1;let t=e;return typeof t.routineSchema==`string`&&typeof t.routineName==`string`&&typeof t.returnType==`string`}function h(e){if(!e||typeof e!=`object`||Array.isArray(e))return!1;let t=e;return Array.isArray(t.schemas)&&t.schemas.every(e=>typeof e==`string`)&&Array.isArray(t.columns)&&t.columns.every(p)&&(t.functions===void 0||Array.isArray(t.functions)&&t.functions.every(m))}function g(e){let t=Array.isArray(e)?e[0]:e;return h(t)?t:null}async function _(e={}){let{name:t}=e,n=[{col:`name`,op:`ilike`,val:t?`%${t}%`:void 0}],r=c.from(`sys_dict_type`).select(`*, cascade_parent_type:dict_type_cascade_parent(id, name, code)`).order(`sort`,{ascending:!0}).order(`name`,{ascending:!0});return r=i(r,n,{skipEmpty:!0,camelToSnake:!1}),await u(()=>r,{})}async function v(e={}){let t=c.from(`sys_dict_type`).select(`id, name, code, cascade_parent_type_id`).eq(`node_type`,`dictionary`).eq(`status`,`1`).order(`name`,{ascending:!0});return e.excludeId&&(t=t.neq(`id`,e.excludeId)),await u(()=>t,{showErrorMessage:!0})}async function y(e={}){let t=await u(()=>c.from(`sys_dict_type`).select(`id, parent_id, node_type, name, code, status, sort`).eq(`node_type`,`directory`).order(`sort`,{ascending:!0}).order(`name`,{ascending:!0}),{showErrorMessage:!0}),n=f.listToTree(t.data??[],(e,t)=>Number(e.sort??0)-Number(t.sort??0)||e.name.localeCompare(t.name,`zh-CN`)),r=e.excludeId?f.removeNodesByCondition(n,t=>t.id===e.excludeId).tree:n;return{...t,data:r}}async function b(e){let{id:t}=e;return await u(()=>c.from(`sys_dict_type`).delete({count:`exact`}).eq(`id`,t),{showMessage:!0,requireAffected:!0,noAffectedMessage:n})}async function x(e){return await u(()=>c.from(`sys_dict_type`).insert(l(e)),{showMessage:!0,breakReturn:!0})}async function S(e){let{id:t,...r}=e;return await u(()=>c.from(`sys_dict_type`).update(l(r),{count:`exact`}).eq(`id`,t),{showMessage:!0,breakReturn:!0,requireAffected:!0,noAffectedMessage:n})}async function C(e){return await u(()=>c.rpc(`save_dict_type_tree_order`,{p_updates:e}),{breakReturn:!0,showMessage:!1})}async function w(e){let{typeId:t,label:n=``,code:r,i18nScope:a,status:o,recordId:s}=e,l=[{col:`id`,op:`eq`,val:s},{col:`typeId`,op:`eq`,val:t},{col:`label`,op:`ilike`,val:`%${n}%`},{col:`code`,op:`eq`,val:r},{col:`i18nScope`,op:`eq`,val:a},{col:`status`,op:`eq`,val:o}],d=c.from(`sys_dictionary`).select(`*`,{count:`exact`}).order(`sort`,{ascending:!0}).order(`label`,{ascending:!0});return d=i(d,l,{skipEmpty:!0,camelToSnake:!0}),await u(()=>d,{})}async function T(e){let{data:t}=await u(()=>c.from(`sys_dictionary`).select(`type_id`).eq(`id`,e).maybeSingle(),{});return t?.typeId}async function E(){return await a(({from:e,to:t})=>{let n=c.from(`sys_dictionary`).select(`
          id,
          type_id,
          code,
          label,
          value,
          status,
          sort,
          color,
          tag_type,
          remark,
          parent_id,
          cascade_parent_id,
          dict_type_table:sys_dict_type!inner(
            code,
            name
          )
        `).eq(`status`,`1`).eq(`dict_type_table.status`,`1`).order(`sort`,{ascending:!0}).order(`id`,{ascending:!0}).range(e,t);return u(()=>n,{})},{pageSize:d})}async function D(e){return await u(()=>c.from(`sys_dictionary`).select(`
          id,
          type_id,
          code,
          label,
          value,
          status,
          sort,
          color,
          tag_type,
          remark,
          parent_id,
          cascade_parent_id,
          dict_type_table:sys_dict_type!inner(
            code,
            name
          )
        `).eq(`status`,`1`).eq(`dict_type_table.status`,`1`).eq(`dict_type_table.code`,e).order(`sort`,{ascending:!0}).order(`id`,{ascending:!0}),{})}async function O(e,t){return u(()=>c.from(`sys_dictionary`).select(`id,type_id,code,label,value,status,sort,color,tag_type,remark,parent_id,cascade_parent_id,dict_type_table:sys_dict_type!inner(code,name)`).eq(`dict_type_table.code`,e).eq(`value`,t).order(`id`,{ascending:!0}).limit(1),{})}async function k(e){let{id:t}=e;return await u(()=>c.from(`sys_dictionary`).delete({count:`exact`}).eq(`id`,t),{showMessage:!0,requireAffected:!0,noAffectedMessage:n})}async function A(e){return await u(()=>c.from(`sys_dictionary`).delete({count:`exact`}).in(`id`,e),{showMessage:!0,requireAffected:!0,noAffectedMessage:n})}async function j(e){return await u(()=>c.from(`sys_dictionary`).insert(l(e)),{showMessage:!0,breakReturn:!0})}async function M(e){let{id:t,...r}=e;return await u(()=>c.from(`sys_dictionary`).update(l(r),{count:`exact`}).eq(`id`,t),{showMessage:!0,breakReturn:!0,requireAffected:!0,noAffectedMessage:n})}async function N(e){let{originName:t=``,suffix:n=``,tenantId:r,from:a=0,to:o=9}=e,s=[{col:`originName`,op:`ilike`,val:`%${t}%`}];if(n){let e=n.split(`,`).map(e=>e.trim()).filter(e=>e.length>0);e.length>0&&s.push({col:`suffix`,op:`in`,val:e})}let l=c.from(`sys_attachment`).select(`*`,{count:`exact`}).order(`create_time`,{ascending:!1}).range(a,o);return r&&(l=l.eq(`tenant_id`,r)),l=i(l,s,{skipEmpty:!0,camelToSnake:!0}),await u(()=>l,{showErrorMessage:!0})}async function P(e){let{id:t,originName:r}=e;return await u(()=>c.from(`sys_attachment`).update({origin_name:r},{count:`exact`}).eq(`id`,t),{breakReturn:!0,requireAffected:!0,noAffectedMessage:n,errorMessage:`附件重命名失败，请稍后重试`})}async function F(e){let{id:t}=e,{data:r}=await u(()=>c.from(`sys_attachment`).select().eq(`id`,t).single(),{});if(!r)throw Error(`未找到待删除的附件`);let{storagePath:i,objectName:a}=r;if(await u(()=>c.from(`sys_attachment`).delete({count:`exact`}).eq(`id`,t),{breakReturn:!0,requireAffected:!0,noAffectedMessage:n,errorMessage:`附件删除失败，请稍后重试`}),!i||!a)return{storageCleanupFailed:!1};let o=`${i}/${a}`,{error:s}=await c.storage.from(`attachments`).remove([o]);return s?(console.warn(`[AttachmentCleanup] 附件记录已删除，但存储对象清理失败:`,s),{storageCleanupFailed:!0}):{storageCleanupFailed:!1}}async function I(){let[{data:e,error:t},n]=await Promise.all([r(`execute-sql-with-columns`,{body:{action:`metadata`}}),L()]);if(t)throw Error(`数据库结构加载失败，请稍后重试`,{cause:t});if(!e)throw Error(`数据库结构服务未返回数据，请稍后重试`);let i=g(e);if(!i)throw Error(`数据库结构响应格式异常，请联系管理员`);let a=i.schemas,o=i.columns.map(e=>({tableSchema:e.tableSchema,tableName:e.tableName,columnName:e.columnName,dataType:e.dataType,isNullable:e.isNullable,ordinalPosition:e.ordinalPosition})),s=new Map;return o.forEach(e=>{let t=`${e.tableSchema}.${e.tableName}`;s.has(t)||s.set(t,{tableSchema:e.tableSchema,tableName:e.tableName,columns:[]}),s.get(t).columns.push({name:e.columnName,dataType:e.dataType,isNullable:e.isNullable===`YES`})}),{schemas:a,columns:o,tables:Array.from(s.values()),functions:(i.functions??[]).map(e=>({routineSchema:e.routineSchema,routineName:e.routineName,returnType:e.returnType})),foreignKeys:n}}async function L(){let{data:e,error:t}=await R({query:`
    SELECT
      source_ns.nspname AS source_schema,
      source_table.relname AS source_table,
      source_column.attname AS source_column,
      target_ns.nspname AS target_schema,
      target_table.relname AS target_table,
      target_column.attname AS target_column,
      relation.conname AS constraint_name
    FROM pg_catalog.pg_constraint relation
    JOIN pg_catalog.pg_class source_table ON source_table.oid = relation.conrelid
    JOIN pg_catalog.pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
    JOIN pg_catalog.pg_class target_table ON target_table.oid = relation.confrelid
    JOIN pg_catalog.pg_namespace target_ns ON target_ns.oid = target_table.relnamespace
    JOIN LATERAL unnest(relation.conkey, relation.confkey)
      AS column_pair(source_attnum, target_attnum) ON true
    JOIN pg_catalog.pg_attribute source_column
      ON source_column.attrelid = source_table.oid
      AND source_column.attnum = column_pair.source_attnum
    JOIN pg_catalog.pg_attribute target_column
      ON target_column.attrelid = target_table.oid
      AND target_column.attnum = column_pair.target_attnum
    WHERE relation.contype = 'f'
      AND source_ns.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY source_ns.nspname, source_table.relname, relation.conname
  `}),n=e?.rows;if(t)throw Error(`数据库关联关系加载失败，请稍后重试`,{cause:t});if(e?.status!==`ok`||!Array.isArray(n))throw Error(`数据库关联关系服务未返回有效数据，请稍后重试`);return n.map(e=>{let t=(t,n)=>{let r=e[t]??e[n];if(typeof r!=`string`||!r)throw Error(`数据库关联关系响应格式异常，请联系管理员`);return r};return{sourceSchema:t(`sourceSchema`,`source_schema`),sourceTable:t(`sourceTable`,`source_table`),sourceColumn:t(`sourceColumn`,`source_column`),targetSchema:t(`targetSchema`,`target_schema`),targetTable:t(`targetTable`,`target_table`),targetColumn:t(`targetColumn`,`target_column`),constraintName:t(`constraintName`,`constraint_name`)}})}async function R(e){return await u(()=>r(`execute-sql-with-columns`,{body:e}),{convertToCamelShadow:!0,returnRawError:!0})}async function z(e){return await u(()=>r(`ai-sql-assistant`,{body:e}),{convertToCamelShadow:!0,returnRawError:!0})}export{N as _,A as a,C as b,M as c,I as d,T as f,v as g,_ as h,k as i,S as l,w as m,x as n,b as o,y as p,s as r,F as s,j as t,R as u,z as v,P as y};