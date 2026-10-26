import"./C0FnF6B9.js";import{F as e,mt as t,t as n,ut as r,z as i}from"./DGOOfgaa.js";import{Kt as a,Lt as o,Mn as s,Rt as c,Vt as l,Yt as u,Zn as d,hn as f,pr as p,qt as m}from"./D1G0yLle.js";import{t as h}from"./QTyGj0E5.js";import{t as g}from"./DP5g8RrD.js";import{n as _,t as v}from"./Bw-9oxOL.js";import{g as y,r as b}from"./BXOBjHVU.js";import{n as x,t as S}from"./h6l3m4uJ.js";/* empty css                            */var C={class:`w-full py-2`},w={class:`mb-6`},T={class:`m-0 mb-2 text-xl font-medium`},E={class:`mb-6`},D={class:`flex-c gap-5`},O={class:`my-1 text-sm text-g-700`},k={class:`font-semibold`},A={class:`my-1 text-sm text-g-700`},j={class:`mb-6 last:mb-0`},M={class:`p-4 mt-3 mb-0 font-mono text-xs leading-[1.5] bg-g-200 border-full-d rounded-md whitespace-pre-wrap break-all`},N={class:``},P={class:`best-practices`},F={class:`practices-content`},I={class:`flex-c`},L={class:`size-10 bg-g-200 flex-cc rounded mr-2`},R={class:`flex-c`},z={class:`size-10 bg-g-200 flex-cc rounded mr-2`},B={class:`flex-c`},V={class:`size-10 bg-g-200 flex-cc rounded mr-2`},H={class:`flex-c`},U={class:`size-10 bg-g-200 flex-cc rounded mr-2`},W=u({name:`PermissionPageVisibility`,__name:`index`,setup(u){let W=b(),G=y.PLATFORM_SUPER,K=o(()=>W.info),q=e=>({[G]:`超级管理员`,R_ADMIN:`管理员`,R_USER:`普通用户`})[e]||`未知角色`;return(o,u)=>{let y=h,b=g,W=x,J=S,Y=n,X=v,Z=_;return f(),l(`div`,C,[c(`div`,w,[c(`h2`,T,p(o.$t(`menus.examples.permission.pageVisibility`)),1),u[0]||(u[0]=c(`p`,{class:`m-0 text-sm leading-[1.6] text-g-700`},[a(` 此页面仅对`),c(`strong`,{class:`font-semibold text-warning`},`超级管理员`),a(`用户可见，演示页面级别的权限控制。 如果您能看到此页面，说明您拥有相应的访问权限。 `)],-1))]),c(`div`,E,[m(b,{class:`art-card-xs`},{header:s(()=>[...u[1]||(u[1]=[c(`div`,{class:`flex-c gap-2 font-semibold`},[c(`span`,null,`权限验证成功`)],-1)])]),default:s(()=>[c(`div`,null,[c(`div`,D,[c(`div`,null,[u[4]||(u[4]=c(`h3`,{class:`m-0 mb-2 text-lg font-semibold`},`您拥有访问此页面的权限`,-1)),c(`p`,O,[u[2]||(u[2]=a(` 当前用户：`,-1)),c(`strong`,k,p(K.value.userName),1)]),c(`p`,A,[u[3]||(u[3]=a(` 用户角色： `,-1)),m(y,{type:`warning`},{default:s(()=>[a(p(q(K.value.userRoles?.[0]||``)),1)]),_:1})])])])])]),_:1})]),c(`div`,j,[m(b,{class:`art-card-xs`},{header:s(()=>[...u[5]||(u[5]=[c(`div`,{class:`flex-c font-semibold`},[c(`span`,null,`页面级权限控制说明`)],-1)])]),default:s(()=>[c(`div`,null,[m(J,null,{default:s(()=>[m(W,{timestamp:`前端控制模式`,type:`primary`,size:`large`},{default:s(()=>[m(b,null,{default:s(()=>[u[6]||(u[6]=c(`h4`,{class:`m-0 mb-2 text-base font-semibold`},`基于角色的权限控制`,-1)),u[7]||(u[7]=c(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},[a(` 在前端控制模式下，页面访问权限由路由配置文件中的 `),c(`code`,{class:`px-1.5 py-0.5 font-mono text-xs text-theme bg-theme/12 rounded`},`meta.roles`),a(` 字段定义，前端会根据用户接口所拥有的角色对路由和菜单进行过滤与控制 `)],-1)),c(`pre`,M,[c(`code`,N,`{
  path: 'page-visibility',
  name: 'PermissionPageVisibility',
  component: '/examples/permission/page-visibility',
  meta: {
    title: 'menus.permission.pageVisibility',
    roles: ['`+p(d(G))+`'], // 仅超级管理员可访问
    keepAlive: true
  }
}`,1)]),u[8]||(u[8]=c(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},[c(`strong`,null,`权限验证流程：`)],-1)),u[9]||(u[9]=c(`ul`,{class:`pl-5 my-2`},[c(`li`,{class:`my-1 leading-[1.5] text-g-700`},`用户登录后，接口返回用户角色信息`),c(`li`,{class:`my-1 leading-[1.5] text-g-700`},[a(` 在 `),c(`code`,{class:`px-1.5 py-0.5 font-mono text-xs text-theme bg-theme/12 rounded`},`beforeEach`),a(` 路由守卫中检查目标路由的 `),c(`code`,{class:`px-1.5 py-0.5 font-mono text-xs text-theme bg-theme/12 rounded`},`roles`),a(` 配置 `)]),c(`li`,{class:`my-1 leading-[1.5] text-g-700`},`比较用户角色是否包含在允许访问的角色列表中`),c(`li`,{class:`my-1 leading-[1.5] text-g-700`},`权限不足时跳转到 403 页面`)],-1))]),_:1})]),_:1}),m(W,{timestamp:`后端控制模式`,type:`warning`,size:`large`},{default:s(()=>[m(b,null,{default:s(()=>[...u[10]||(u[10]=[c(`h4`,{class:`m-0 mb-2 text-base font-semibold`},`基于菜单接口的权限控制`,-1),c(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},`在后端控制模式下，页面访问权限由后端统一管理，前端通过解析后端接口返回的菜单列表来生成可访问的路由，从而实现权限控制`,-1),c(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},`接口地址：src/api/menuApi.ts getMenuList`,-1),c(`pre`,{class:`p-4 mt-3 mb-0 font-mono text-xs leading-[1.5] bg-g-200 border-full-d rounded-md whitespace-pre-wrap break-all`},[c(`code`,{class:``},`
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "path": "/permission",
      "name": "Permission",
      "component": "Layout",
      "meta": {
        "title": "menus.permission.title",
        "icon": ""
      },
      "children": [
        {
          "id": 11,
          "path": "page-visibility",
          "name": "PermissionPageVisibility",
          "component": "permission/page-visibility/index",
          "meta": {
            "title": "menus.permission.pageVisibility",
            "keepAlive": true
          }
        }
      ]
    }
  ]
}`)],-1),c(`p`,null,[c(`strong`,null,`权限验证流程：`)],-1),c(`ul`,null,[c(`li`,null,`用户登录成功后获取 Token`),c(`li`,null,`前端调用菜单接口获取用户可访问的菜单列表`),c(`li`,null,`前端根据菜单列表动态注册路由`),c(`li`,null,`菜单中存在的页面用户可以正常访问，不存在的页面会跳转到 404`)],-1)])]),_:1})]),_:1}),m(W,{timestamp:`菜单显示控制`,type:`success`,size:`large`},{default:s(()=>[m(b,null,{default:s(()=>[...u[11]||(u[11]=[c(`h4`,null,`侧边栏菜单可见性`,-1),c(`p`,null,[c(`strong`,null,`前端控制模式：`)],-1),c(`ul`,null,[c(`li`,null,`有权限的用户：菜单项正常显示，可以点击访问`),c(`li`,null,`无权限的用户：菜单项不显示，无法通过菜单导航到页面`),c(`li`,null,`即使通过直接输入URL尝试访问，也会被路由守卫拦截`)],-1),c(`p`,null,[c(`strong`,null,`后端控制模式：`)],-1),c(`ul`,null,[c(`li`,null,`侧边栏菜单根据后端返回的菜单列表进行渲染`),c(`li`,null,`后端应该根据用户权限过滤，只返回用户有权限访问的菜单项`),c(`li`,null,`前端只显示后端返回的菜单，确保用户只能看到和访问有权限的页面`)],-1)])]),_:1})]),_:1})]),_:1})])]),_:1})]),c(`div`,P,[m(b,{class:`art-card-xs`},{header:s(()=>[...u[12]||(u[12]=[c(`div`,{class:`card-header`},[c(`span`,null,`权限控制最佳实践`)],-1)])]),default:s(()=>[c(`div`,F,[m(Z,{gutter:24},{default:s(()=>[m(X,{span:12,class:`!mb-5`},{default:s(()=>[c(`div`,I,[c(`div`,L,[m(Y,{size:`20`,color:`#409EFF`},{default:s(()=>[m(d(i))]),_:1})]),u[13]||(u[13]=c(`div`,null,[c(`h4`,null,`多层权限验证`),c(`p`,{class:`text-g-700 text-sm`},`在前端路由、后端接口、UI组件等多个层面实施权限控制，确保安全性。`)],-1))])]),_:1}),m(X,{span:12},{default:s(()=>[c(`div`,R,[c(`div`,z,[m(Y,{size:`20`,color:`#67C23A`},{default:s(()=>[m(d(r))]),_:1})]),u[14]||(u[14]=c(`div`,null,[c(`h4`,null,`基于角色的访问控制`),c(`p`,{class:`text-g-700 text-sm`},`采用RBAC模型，通过角色分配权限，简化权限管理复杂度。`)],-1))])]),_:1}),m(X,{span:12},{default:s(()=>[c(`div`,B,[c(`div`,V,[m(Y,{size:`20`,color:`#E6A23C`},{default:s(()=>[m(d(e))]),_:1})]),u[15]||(u[15]=c(`div`,null,[c(`h4`,null,`细粒度权限控制`),c(`p`,{class:`text-g-700 text-sm`},`支持页面级、按钮级、数据级等多种粒度的权限控制。`)],-1))])]),_:1}),m(X,{span:12},{default:s(()=>[c(`div`,H,[c(`div`,U,[m(Y,{size:`20`,color:`#F56C6C`},{default:s(()=>[m(d(t))]),_:1})]),u[16]||(u[16]=c(`div`,null,[c(`h4`,null,`安全性优先原则`),c(`p`,{class:`text-g-700 text-sm`},`始终遵循最小权限原则，确保用户只能访问必要的功能和数据。`)],-1))])]),_:1})]),_:1})])]),_:1})])])}}});export{W as default};