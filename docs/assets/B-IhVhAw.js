import{Dt as e,Ut as t}from"./DzAe94m_.js";import{in as n,nr as r,ot as i,tn as a,ut as o}from"./1wCw6UuY.js";var s={prefix:Math.floor(Math.random()*1e4),current:0},c=Symbol(`elIdInjection`),l=()=>a()?n(c,s):s,u=n=>{let a=l();!o&&a===s&&t(`IdInjection`,`Looks like you are using server rendering, you must provide a id provider to ensure the hydration process to be succeed
usage: app.provide(ID_INJECTION_KEY, {
  prefix: number,
  current: number,
})`);let c=e();return i(()=>r(n)||`${c.value}-id-${a.prefix}-${a.current++}`)};export{l as n,u as t};