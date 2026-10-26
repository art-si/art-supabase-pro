import{o as e}from"./C0FnF6B9.js";import{_ as t,ht as n}from"./BSNxp16s.js";import{Lt as r,bt as i}from"./CcWmjWVo.js";import{r as a}from"./DeUCRM1t.js";import{a as o}from"./D4eDpPa9.js";import{r as s}from"./D1sicRT-.js";import{t as c}from"./DuGDGNXG.js";import{t as l}from"./15ClEC-l.js";import{Bn as u,Pr as d}from"./CQ03wtv3.js";var f=e(t(),1);function p(e,t=(0,f.default)().format(`YYYY-MM-DD`)){return e.map((e,n)=>{if(!r(e))throw h(n);let i=String(e.employeeNo??``).trim(),o=String(e.warehouseCode??``).trim(),s=String(e.issuerEmployeeNo??``).trim(),c=String(e.materialCode??``).trim(),l=a(e.issueQuantity);if(!i||!o||!s||!c||l===null||l<=0)throw h(n);let u=String(e.issueDate??``);return{employeeNo:i,warehouseCode:o,issuerEmployeeNo:s,materialCode:c,fileRow:n+1,issueQuantity:l,issueDate:(0,f.default)(u).isValid()?(0,f.default)(u).format(`YYYY-MM-DD`):t,remark:String(e.remark??``)}})}async function m(e,t){let n=[];for(let r of e)n.push({...r,...await t(r)});return n}function h(e){return Error(`第 ${e+1} 行缺少必填字段或发放数量不是正数`)}function g(e,t){let n=i(),r=l(async t=>(await o(s,{tenantId:e,keyword:t,from:0})).filter(n=>n.tenantId===e&&n.employeeNo===t)),a=l(async t=>(await o(u,{keyword:t,status:`enabled`,from:0})).filter(n=>n.tenantId===e&&n.locationCode===t)),c=l(async n=>(await o(d,{materialCode:n,materialType:t,status:`enabled`,from:0})).filter(t=>t.tenantId===e&&t.materialCode===n));return async e=>{n();let[i,o,s,l]=await Promise.all([r(e.employeeNo,`员工工号：${e.employeeNo}`),r(e.issuerEmployeeNo,`员工工号：${e.issuerEmployeeNo}`),a(e.warehouseCode,`启用仓库编码：${e.warehouseCode}`),c(e.materialCode,`${t===`tool`?`工器具`:`防护用品`}编码：${e.materialCode}`)]);return n(),{employee:i,issuer:o,warehouse:s,material:l}}}function _(e,t,r){let i=e.items.map((e,t)=>`<tr><td>${t+1}</td><td>${n(e.materialName)}</td><td>${n(e.specificationModel||`—`)}</td><td>${n(String(e.issueQuantity))}</td><td>${n(r(e.unit))}</td><td>${n(e.remark||``)}</td></tr>`).join(``);return`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${n(e.issuanceNo)}</title>
  <style>
    body { padding: 32px; color: #1f2937; font: 14px/1.5 sans-serif; }
    h1 { text-align: center; font-size: 22px; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 24px; margin: 24px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 9px; border: 1px solid #9ca3af; text-align: left; }
    .sign { display: flex; justify-content: space-between; margin-top: 48px; }
    @media screen and (max-width: 640px) {
      body { padding: 12px; }
      .meta { grid-template-columns: 1fr; }
      table { table-layout: fixed; font-size: 11px; }
      th, td { padding: 4px; overflow-wrap: anywhere; }
      .sign { flex-wrap: wrap; gap: 12px 24px; }
    }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${t}发放单</h1>
  <div class="meta">
    <span>单据编号：${n(e.issuanceNo)}</span>
    <span>领用人：${n(e.employeeName)}</span>
    <span>员工工号：${n(e.employeeNo)}</span>
    <span>所属组织：${n(e.organizationName||`—`)}</span>
    <span>发放仓库：${n(e.warehouseName)}</span>
    <span>发放日期：${n(e.issueDate)}</span>
  </div>
  <table>
    <thead><tr><th>序号</th><th>${t}</th><th>规格型号</th><th>发放数量</th><th>单位</th><th>备注</th></tr></thead>
    <tbody>${i}</tbody>
  </table>
  <div class="sign">
    <span>领用人签字：____________</span>
    <span>发放人：${n(e.issuerName)}</span>
    <span>日期：____________</span>
  </div>
</body>
</html>`}function v(e,t,n){c(_(e,t,n),`width=980,height=760`)}function y(e,t,n,r,i){return{id:t,tenantId:e,employeeNo:n,employeeName:r,jobTitle:i,employmentStatus:`active`}}function b(e,t){let{copy:n,today:r,materialType:i}=t;return{form:{id:n?void 0:e.id,issuanceNo:n?``:e.issuanceNo,employeeId:e.employeeId,warehouseId:e.warehouseId,issuerEmployeeId:e.issuerEmployeeId,issueDate:n?r:e.issueDate,remark:e.remark||``,items:e.items.map(e=>({...e,id:void 0}))},selection:{employee:[y(e.tenantId,e.employeeId,e.employeeNo,e.employeeName,e.positionName)],issuer:[y(e.tenantId,e.issuerEmployeeId,``,e.issuerName)],warehouse:[{id:e.warehouseId,tenantId:e.tenantId,organizationId:e.organizationId||``,locationCode:``,locationName:e.warehouseName,status:`enabled`,childCount:0,organization:{id:e.organizationId||``,organizationCode:``,organizationName:e.organizationName||``}}],materialIds:e.items.map(e=>e.materialId),materials:e.items.map(t=>({id:t.materialId,tenantId:e.tenantId,materialCode:``,materialName:t.materialName,categoryId:``,category:{id:``,categoryCode:``,categoryName:t.materialCategory||``},specificationModel:t.specificationModel,drawingNo:null,basicUnit:t.unit,materialType:i,materialSource:`purchase`,brand:null,materialComposition:null,placeOfOrigin:null,imageUrls:[],description:null,status:`enabled`,sort:10}))}}}export{p as a,g as i,b as n,m as o,v as r,y as t};