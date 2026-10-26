import{n as e,v as t,x as n}from"./C9XYUvyK.js";import"./CmSLjCq2.js";import{n as r}from"./BH7Ql9De.js";import{a as i,o as a}from"./C6agQ-Gx.js";var o=`
.patch-viewer{min-height:100%;--patch-bg:#f6f8fa;--patch-surface:#fff;--patch-border:rgba(31,35,40,.12);--patch-text:#24292f;--patch-muted:#57606a;--patch-add:#dafbe1;--patch-del:#ffebe9;--patch-info:#ddf4ff;--patch-font-size:13px;background:var(--patch-bg);color:var(--patch-text);box-sizing:border-box}
.patch-toolbar{position:sticky;top:0;z-index:2;display:flex;height:46px;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;border-bottom:1px solid var(--patch-border);background:rgba(255,255,255,.92);backdrop-filter:blur(12px);box-sizing:border-box}
.patch-toolbar span,.patch-toolbar strong{color:var(--patch-muted);font-size:12px;font-weight:800;letter-spacing:0}
.patch-body{padding:16px;overflow:auto;font-size:var(--patch-font-size)}
.patch-body .d2h-wrapper{min-width:860px}
.patch-body .d2h-file-wrapper{margin:0 0 16px;overflow:hidden;border:1px solid var(--patch-border);border-radius:8px;background:var(--patch-surface)}
.patch-body .d2h-file-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--patch-border);background:#f8fafc;color:var(--patch-muted);font-weight:800}
.patch-body .d2h-file-name-wrapper{display:flex;min-width:0;align-items:center;gap:8px}
.patch-body .d2h-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.patch-body .d2h-files-diff{display:flex}
.patch-body .d2h-file-side-diff{flex:1 1 0;min-width:0;overflow-x:auto}
.patch-body .d2h-diff-table{width:100%;border-collapse:collapse;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;font-size:1em;line-height:1.58}
.patch-body .d2h-diff-table td{padding:0;vertical-align:top}
.patch-body td.d2h-code-side-linenumber,.patch-body td.d2h-code-linenumber{box-sizing:border-box;width:4.5em;min-width:4.5em;padding:0 8px;border-right:1px solid var(--patch-border);color:var(--patch-muted);text-align:right;white-space:nowrap;user-select:none}
/* Ignore template whitespace; only source spans preserve indentation. Long lines scroll without changing matched row heights. */
.patch-body .d2h-code-side-line,.patch-body .d2h-code-line{display:flex;min-height:1.58em;padding:0 10px;white-space:nowrap;word-break:normal;overflow-wrap:normal}
.patch-body .d2h-code-line-prefix{flex:0 0 1ch;white-space:pre;user-select:none}
.patch-body .d2h-code-line-ctn{display:block;flex:0 0 auto;white-space:pre}
.patch-body .d2h-emptyplaceholder{background:var(--patch-bg)}
.patch-body .d2h-ins{background:var(--patch-add)}
.patch-body .d2h-del{background:var(--patch-del)}
.patch-body .d2h-info{background:var(--patch-info);color:var(--patch-muted)}
.patch-body .d2h-file-list-wrapper{margin:0 0 16px;border:1px solid var(--patch-border);border-radius:8px;background:var(--patch-surface)}
.patch-body .d2h-file-list-header{padding:10px 12px;border-bottom:1px solid var(--patch-border);color:var(--patch-muted);font-weight:800}
.patch-body .d2h-file-list{margin:0;padding:8px 12px;list-style:none}
.patch-body .d2h-file-list-line{display:flex;gap:8px;padding:4px 0;color:var(--patch-text);font-size:.95em}
.patch-fallback{margin:0;padding:18px 20px;overflow:auto;border-radius:8px;background:#0d1117;color:#e6edf3;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;font-size:var(--patch-font-size);line-height:1.7;white-space:pre}
[data-viewer-theme='dark'] .patch-viewer{--patch-bg:#0d1117;--patch-surface:#161b22;--patch-border:rgba(139,148,158,.24);--patch-text:#e6edf3;--patch-muted:#8b949e;--patch-add:rgba(46,160,67,.26);--patch-del:rgba(248,81,73,.24);--patch-info:rgba(56,139,253,.18)}
[data-viewer-theme='dark'] .patch-toolbar{background:rgba(13,17,23,.92)}
[data-viewer-theme='dark'] .patch-body .d2h-file-header{background:#161b22}
@media (prefers-color-scheme:dark){[data-viewer-theme='system'] .patch-viewer{--patch-bg:#0d1117;--patch-surface:#161b22;--patch-border:rgba(139,148,158,.24);--patch-text:#e6edf3;--patch-muted:#8b949e;--patch-add:rgba(46,160,67,.26);--patch-del:rgba(248,81,73,.24);--patch-info:rgba(56,139,253,.18)}[data-viewer-theme='system'] .patch-toolbar{background:rgba(13,17,23,.92)}[data-viewer-theme='system'] .patch-body .d2h-file-header{background:#161b22}}
`,s=(e,t,n,r)=>{let i=e.createElement(t);return n&&(i.className=n),typeof r==`string`&&(i.textContent=r),i},c=e=>{let t=e.createElement(`style`);return t.textContent=o,t},l=e=>Math.min(2.4,Math.max(.6,Number(e.toFixed(2)))),u=e=>{let t=e.match(/^diff --git\s+/gm);return t?.length?t.length:e.match(/^---\s+/gm)?.length||1};async function d(o,d,f=`patch`,p){let m=d.ownerDocument||document,h=r(o,p?.options?.text?.encoding).text,g=1,_=e(),v=s(m,`div`,`patch-viewer`);v.dataset.viewerZoomProvider=`patch`;let y=s(m,`div`,`patch-toolbar`);y.append(s(m,`span`,void 0,f.toUpperCase()),s(m,`strong`,void 0,`${u(h)} files · side-by-side`));let b=s(m,`div`,`patch-body`);try{let e=a();if(!e)throw Error("Patch side-by-side rendering is opt-in. Run `npx file-viewer-cli add text-tools --write`, then `npx file-viewer-cli install --yes`.");let t=e(h,{drawFileList:!0,matching:`lines`,outputFormat:`side-by-side`,renderNothingWhenEmpty:!1});b.replaceChildren(i(m,t,{allowSvg:!0}))}catch{let e=s(m,`pre`,`patch-fallback`);e.textContent=h,b.replaceChildren(e)}v.append(y,b),v.style.setProperty(`--patch-font-size`,`${13*g}px`),d.replaceChildren(c(m),v);let x=()=>({scale:g,label:`${Math.round(g*100)}%`,canZoomIn:g<2.4,canZoomOut:g>.6,canReset:g!==1,minScale:.6,maxScale:2.4}),S=e=>(g=l(e),v.style.setProperty(`--patch-font-size`,`${13*g}px`),_.emit(),x());return t(v,{zoomIn:()=>S(g+.1),zoomOut:()=>S(g-.1),resetZoom:()=>S(1),setZoom:S,getState:x,subscribe:_.subscribe}),{$el:v,unmount(){n(v),d.replaceChildren()}}}export{d as default};