import{at as e}from"./CcWmjWVo.js";import{a as t}from"./dGMWZRjz.js";import{t as n}from"./DjyQFO4r.js";var{supabase:r,responseHandle:i}=e(),a=`
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
`;function o(e,t){return t.artifactId&&(e=e.eq(`id`,t.artifactId)),t.feature&&(e=e.eq(`feature`,t.feature)),t.status&&(e=e.eq(`status`,t.status)),t.creator&&(e=e.ilike(`create_by`,`%${t.creator.trim()}%`)),t.confidenceLevel===`low`&&(e=e.lt(`confidence`,.65)),t.confidenceLevel===`medium`&&(e=e.gte(`confidence`,.65).lt(`confidence`,.85)),t.confidenceLevel===`high`&&(e=e.gte(`confidence`,.85)),n(e,t.createTimeRange)}async function s(e){let{from:t=0,to:n=9}=e,s=r.from(`ai_artifact_review`).select(a,{count:`exact`}).in(`feature`,[`invoice_ocr`,`waybill_receipt_ocr`,`cash_voucher_ocr`,`waybill_expense_ocr`]);e.sort===`risk`&&(s=s.order(`confidence`,{ascending:!0,nullsFirst:!0})),s=s.order(`create_time`,{ascending:!1}).range(t,n);let c=o(s,e);return await i(()=>c,{showErrorMessage:!0})}async function c(e){return await i(()=>r.from(`ai_artifact_review`).select(a).eq(`id`,e).single(),{showErrorMessage:!0})}async function l(){return await i(()=>r.rpc(`ai_ocr_recognition_overview`),{showErrorMessage:!0,convertToCamelShadow:!0})}function u(e,t){let n=e.metadata?.[t];return typeof n==`string`?n:``}function d(e){let n={aiArtifactId:e.id};if(e.feature===`invoice_ocr`)return{path:t.invoiceManagement,query:{...n,direction:u(e,`direction`)||`output`}};if(e.feature===`cash_voucher_ocr`){let r=u(e,`direction`)||`receipt`;return{path:r===`payment`?t.paymentApplication:t.cashTransaction,query:{...n,direction:r}}}return e.feature===`waybill_expense_ocr`?{path:t.waybillCost,query:n}:{path:`/tms/delivery-management`,query:{...n,orderId:u(e,`orderId`),keyword:u(e,`orderNo`)}}}export{l as a,s as i,u as n,c as r,d as t};