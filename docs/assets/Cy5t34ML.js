import{Dt as e,Ut as t}from"./DOYyduJo.js";import{Qt as n,Xn as r,Yt as i,at as a,tt as o}from"./B2BaADVT.js";var s={prefix:Math.floor(Math.random()*1e4),current:0},c=Symbol(`elIdInjection`),l=()=>i()?n(c,s):s,u=n=>{let i=l();!a&&i===s&&t(`IdInjection`,`Looks like you are using server rendering, you must provide a id provider to ensure the hydration process to be succeed
usage: app.provide(ID_INJECTION_KEY, {
  prefix: number,
  current: number,
})`);let c=e();return o(()=>r(n)||`${c.value}-id-${i.prefix}-${i.current++}`)};export{l as n,u as t};