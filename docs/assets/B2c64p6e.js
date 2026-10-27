import{at as e,bt as t}from"./BH5wKnFV.js";import{a as n}from"./dGMWZRjz.js";import{t as r}from"./DjyQFO4r.js";var{supabase:i,responseHandle:a}=e(),o=`
  *,
  run:ai_run!ai_artifact_review_ai_run_id_fkey(
    id,
    model,
    status,
    latency_ms,
    error_code,
    error_message,
    metadata,
    started_at,
    finished_at
  )
`;function s(e,t){return t.artifactId&&(e=e.eq(`id`,t.artifactId)),t.feature&&(e=e.eq(`feature`,t.feature)),t.status&&(e=e.eq(`status`,t.status)),t.creator&&(e=e.ilike(`create_by`,`%${t.creator.trim()}%`)),t.confidenceLevel===`low`&&(e=e.lt(`confidence`,.65)),t.confidenceLevel===`medium`&&(e=e.gte(`confidence`,.65).lt(`confidence`,.85)),t.confidenceLevel===`high`&&(e=e.gte(`confidence`,.85)),r(e,t.createTimeRange)}async function c(e){let n=t(),{from:r=0,to:c=9}=e,l=i.from(`ai_artifact_review`).select(o,{count:`exact`}).in(`feature`,[`invoice_ocr`,`waybill_receipt_ocr`,`cash_voucher_ocr`,`waybill_expense_ocr`]);e.sort===`risk`&&(l=l.order(`confidence`,{ascending:!0,nullsFirst:!0})),l=l.order(`create_time`,{ascending:!1}).range(r,c);let u=s(l,e),d=await a(()=>u,{showErrorMessage:!1});return n(),d}async function l(e){let n=t(),r=await a(()=>i.from(`ai_artifact_review`).select(o).eq(`id`,e).single(),{showErrorMessage:!0});return n(),r}async function u(){let e=t(),n=await a(()=>i.rpc(`ai_ocr_recognition_overview`),{showErrorMessage:!1,convertToCamelShadow:!0});return e(),n}function d(){return{total:0,pending:0,applied:0,rejected:0,lowConfidence:0,pendingLowConfidence:0,today:0,avgConfidence:0,byFeature:{}}}function f(e,t){let n=e.metadata?.[t];return typeof n==`string`?n:``}function p(e){let t={aiArtifactId:e.id};if(e.feature===`invoice_ocr`)return{path:n.invoiceManagement,query:{...t,direction:f(e,`direction`)||`output`}};if(e.feature===`cash_voucher_ocr`){let r=f(e,`direction`)||`receipt`;return{path:r===`payment`?n.paymentApplication:n.cashTransaction,query:{...t,direction:r}}}return e.feature===`waybill_expense_ocr`?{path:n.waybillCost,query:t}:{path:`/tms/delivery-management`,query:{...t,orderId:f(e,`orderId`),keyword:f(e,`orderNo`)}}}export{c as a,l as i,d as n,u as o,f as r,p as t};