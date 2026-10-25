import{o as e}from"./C0FnF6B9.js";import{_ as t,ht as n}from"./CGddwX_3.js";import{Lt as r,bt as i}from"./BHcBEMpg.js";import{r as a}from"./CbfXQ01C.js";import{a as o}from"./Bk87UUYF.js";import{r as s}from"./B6dl0hGX.js";import{t as c}from"./QdO0Gwsz.js";import{t as l}from"./CpaaM9Mj.js";import{Nr as u,zn as d}from"./BnrLIln-.js";var f=e(t(),1);function p(e,t=(0,f.default)().format(`YYYY-MM-DD`)){return e.map((e,n)=>{if(!r(e))throw h(n);let i=String(e.employeeNo??``).trim(),o=String(e.warehouseCode??``).trim(),s=String(e.issuerEmployeeNo??``).trim(),c=String(e.materialCode??``).trim(),l=a(e.issueQuantity);if(!i||!o||!s||!c||l===null||l<=0)throw h(n);let u=String(e.issueDate??``);return{employeeNo:i,warehouseCode:o,issuerEmployeeNo:s,materialCode:c,fileRow:n+1,issueQuantity:l,issueDate:(0,f.default)(u).isValid()?(0,f.default)(u).format(`YYYY-MM-DD`):t,remark:String(e.remark??``)}})}async function m(e,t){let n=[];for(let r of e)n.push({...r,...await t(r)});return n}function h(e){return Error(`第 ${e+1} 行缺少必填字段或发放数量不是正数`)}function g(e,t){let n=i(),r=l(async t=>(await o(s,{tenantId:e,keyword:t,from:0})).filter(n=>n.tenantId===e&&n.employeeNo===t)),a=l(async t=>(await o(d,{keyword:t,status:`enabled`,from:0})).filter(n=>n.tenantId===e&&n.locationCode===t)),c=l(async n=>(await o(u,{materialCode:n,materialType:t,status:`enabled`,from:0})).filter(t=>t.tenantId===e&&t.materialCode===n));return async e=>{n();let[i,o,s,l]=await Promise.all([r(e.employeeNo,`员工工号：${e.employeeNo}`),r(e.issuerEmployeeNo,`员工工号：${e.issuerEmployeeNo}`),a(e.warehouseCode,`启用仓库编码：${e.warehouseCode}`),c(e.materialCode,`${t===`tool`?`工器具`:`防护用品`}编码：${e.materialCode}`)]);return n(),{employee:i,issuer:o,warehouse:s,material:l}}}function _(e,t,r){let i=e.items.map((e,t)=>`<tr><td>${t+1}</td><td>${n(e.materialName)}</td><td>${n(e.specificationModel||`—`)}</td><td>${n(String(e.issueQuantity))}</td><td>${n(r(e.unit))}</td><td>${n(e.remark||``)}</td></tr>`).join(``);return`<!doctype html>
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
</html>`}function v(e,t,n){c(_(e,t,n),`width=980,height=760`)}export{m as i,g as n,p as r,v as t};