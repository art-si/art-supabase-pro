import{Dt as e,Ut as t}from"./BX9KwsZX.js";import{$t as n,ct as r,er as i,it as a,nn as o}from"./CMyQbSvq.js";var s={prefix:Math.floor(Math.random()*1e4),current:0},c=Symbol(`elIdInjection`),l=()=>n()?o(c,s):s,u=n=>{let o=l();!r&&o===s&&t(`IdInjection`,`Looks like you are using server rendering, you must provide a id provider to ensure the hydration process to be succeed
usage: app.provide(ID_INJECTION_KEY, {
  prefix: number,
  current: number,
})`);let c=e();return a(()=>i(n)||`${c.value}-id-${o.prefix}-${o.current++}`)};export{l as n,u as t};