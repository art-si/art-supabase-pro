import"./C0FnF6B9.js";import{F as e,mt as t,t as n,ut as r,z as i}from"./DOYyduJo.js";import{Bt as a,Gt as o,It as s,Jt as c,Kt as l,Lt as u,Xn as d,fr as f,jn as p,mn as m}from"./B2BaADVT.js";import{t as h}from"./DNcvcUG3.js";import{t as g}from"./FUuUWP7X.js";import{n as _,t as v}from"./Dd3ZyJ5E.js";import{g as y,r as b}from"./D-vePxgO.js";import{n as x,t as S}from"./10R6dHCg.js";/* empty css                            */var C={class:`w-full py-2`},w={class:`mb-6`},T={class:`m-0 mb-2 text-xl font-medium`},E={class:`mb-6`},D={class:`flex-c gap-5`},O={class:`my-1 text-sm text-g-700`},k={class:`font-semibold`},A={class:`my-1 text-sm text-g-700`},j={class:`mb-6 last:mb-0`},M={class:`p-4 mt-3 mb-0 font-mono text-xs leading-[1.5] bg-g-200 border-full-d rounded-md whitespace-pre-wrap break-all`},N={class:``},P={class:`best-practices`},F={class:`practices-content`},I={class:`flex-c`},L={class:`size-10 bg-g-200 flex-cc rounded mr-2`},R={class:`flex-c`},z={class:`size-10 bg-g-200 flex-cc rounded mr-2`},B={class:`flex-c`},V={class:`size-10 bg-g-200 flex-cc rounded mr-2`},H={class:`flex-c`},U={class:`size-10 bg-g-200 flex-cc rounded mr-2`},W=c({name:`PermissionPageVisibility`,__name:`index`,setup(c){let W=b(),G=y.PLATFORM_SUPER,K=s(()=>W.info),q=e=>({[G]:`超级管理员`,R_ADMIN:`管理员`,R_USER:`普通用户`})[e]||`未知角色`;return(s,c)=>{let y=h,b=g,W=x,J=S,Y=n,X=v,Z=_;return m(),a(`div`,C,[u(`div`,w,[u(`h2`,T,f(s.$t(`menus.examples.permission.pageVisibility`)),1),c[0]||(c[0]=u(`p`,{class:`m-0 text-sm leading-[1.6] text-g-700`},[o(` 此页面仅对`),u(`strong`,{class:`font-semibold text-warning`},`超级管理员`),o(`用户可见，演示页面级别的权限控制。 如果您能看到此页面，说明您拥有相应的访问权限。 `)],-1))]),u(`div`,E,[l(b,{class:`art-card-xs`},{header:p(()=>[...c[1]||(c[1]=[u(`div`,{class:`flex-c gap-2 font-semibold`},[u(`span`,null,`权限验证成功`)],-1)])]),default:p(()=>[u(`div`,null,[u(`div`,D,[u(`div`,null,[c[4]||(c[4]=u(`h3`,{class:`m-0 mb-2 text-lg font-semibold`},`您拥有访问此页面的权限`,-1)),u(`p`,O,[c[2]||(c[2]=o(` 当前用户：`,-1)),u(`strong`,k,f(K.value.userName),1)]),u(`p`,A,[c[3]||(c[3]=o(` 用户角色： `,-1)),l(y,{type:`warning`},{default:p(()=>[o(f(q(K.value.userRoles?.[0]||``)),1)]),_:1})])])])])]),_:1})]),u(`div`,j,[l(b,{class:`art-card-xs`},{header:p(()=>[...c[5]||(c[5]=[u(`div`,{class:`flex-c font-semibold`},[u(`span`,null,`页面级权限控制说明`)],-1)])]),default:p(()=>[u(`div`,null,[l(J,null,{default:p(()=>[l(W,{timestamp:`前端控制模式`,type:`primary`,size:`large`},{default:p(()=>[l(b,null,{default:p(()=>[c[6]||(c[6]=u(`h4`,{class:`m-0 mb-2 text-base font-semibold`},`基于角色的权限控制`,-1)),c[7]||(c[7]=u(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},[o(` 在前端控制模式下，页面访问权限由路由配置文件中的 `),u(`code`,{class:`px-1.5 py-0.5 font-mono text-xs text-theme bg-theme/12 rounded`},`meta.roles`),o(` 字段定义，前端会根据用户接口所拥有的角色对路由和菜单进行过滤与控制 `)],-1)),u(`pre`,M,[u(`code`,N,`{
  path: 'page-visibility',
  name: 'PermissionPageVisibility',
  component: '/examples/permission/page-visibility',
  meta: {
    title: 'menus.permission.pageVisibility',
    roles: ['`+f(d(G))+`'], // 仅超级管理员可访问
    keepAlive: true
  }
}`,1)]),c[8]||(c[8]=u(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},[u(`strong`,null,`权限验证流程：`)],-1)),c[9]||(c[9]=u(`ul`,{class:`pl-5 my-2`},[u(`li`,{class:`my-1 leading-[1.5] text-g-700`},`用户登录后，接口返回用户角色信息`),u(`li`,{class:`my-1 leading-[1.5] text-g-700`},[o(` 在 `),u(`code`,{class:`px-1.5 py-0.5 font-mono text-xs text-theme bg-theme/12 rounded`},`beforeEach`),o(` 路由守卫中检查目标路由的 `),u(`code`,{class:`px-1.5 py-0.5 font-mono text-xs text-theme bg-theme/12 rounded`},`roles`),o(` 配置 `)]),u(`li`,{class:`my-1 leading-[1.5] text-g-700`},`比较用户角色是否包含在允许访问的角色列表中`),u(`li`,{class:`my-1 leading-[1.5] text-g-700`},`权限不足时跳转到 403 页面`)],-1))]),_:1})]),_:1}),l(W,{timestamp:`后端控制模式`,type:`warning`,size:`large`},{default:p(()=>[l(b,null,{default:p(()=>[...c[10]||(c[10]=[u(`h4`,{class:`m-0 mb-2 text-base font-semibold`},`基于菜单接口的权限控制`,-1),u(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},`在后端控制模式下，页面访问权限由后端统一管理，前端通过解析后端接口返回的菜单列表来生成可访问的路由，从而实现权限控制`,-1),u(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},`接口地址：src/api/menuApi.ts getMenuList`,-1),u(`pre`,{class:`p-4 mt-3 mb-0 font-mono text-xs leading-[1.5] bg-g-200 border-full-d rounded-md whitespace-pre-wrap break-all`},[u(`code`,{class:``},`
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
}`)],-1),u(`p`,null,[u(`strong`,null,`权限验证流程：`)],-1),u(`ul`,null,[u(`li`,null,`用户登录成功后获取 Token`),u(`li`,null,`前端调用菜单接口获取用户可访问的菜单列表`),u(`li`,null,`前端根据菜单列表动态注册路由`),u(`li`,null,`菜单中存在的页面用户可以正常访问，不存在的页面会跳转到 404`)],-1)])]),_:1})]),_:1}),l(W,{timestamp:`菜单显示控制`,type:`success`,size:`large`},{default:p(()=>[l(b,null,{default:p(()=>[...c[11]||(c[11]=[u(`h4`,null,`侧边栏菜单可见性`,-1),u(`p`,null,[u(`strong`,null,`前端控制模式：`)],-1),u(`ul`,null,[u(`li`,null,`有权限的用户：菜单项正常显示，可以点击访问`),u(`li`,null,`无权限的用户：菜单项不显示，无法通过菜单导航到页面`),u(`li`,null,`即使通过直接输入URL尝试访问，也会被路由守卫拦截`)],-1),u(`p`,null,[u(`strong`,null,`后端控制模式：`)],-1),u(`ul`,null,[u(`li`,null,`侧边栏菜单根据后端返回的菜单列表进行渲染`),u(`li`,null,`后端应该根据用户权限过滤，只返回用户有权限访问的菜单项`),u(`li`,null,`前端只显示后端返回的菜单，确保用户只能看到和访问有权限的页面`)],-1)])]),_:1})]),_:1})]),_:1})])]),_:1})]),u(`div`,P,[l(b,{class:`art-card-xs`},{header:p(()=>[...c[12]||(c[12]=[u(`div`,{class:`card-header`},[u(`span`,null,`权限控制最佳实践`)],-1)])]),default:p(()=>[u(`div`,F,[l(Z,{gutter:24},{default:p(()=>[l(X,{span:12,class:`!mb-5`},{default:p(()=>[u(`div`,I,[u(`div`,L,[l(Y,{size:`20`,color:`#409EFF`},{default:p(()=>[l(d(i))]),_:1})]),c[13]||(c[13]=u(`div`,null,[u(`h4`,null,`多层权限验证`),u(`p`,{class:`text-g-700 text-sm`},`在前端路由、后端接口、UI组件等多个层面实施权限控制，确保安全性。`)],-1))])]),_:1}),l(X,{span:12},{default:p(()=>[u(`div`,R,[u(`div`,z,[l(Y,{size:`20`,color:`#67C23A`},{default:p(()=>[l(d(r))]),_:1})]),c[14]||(c[14]=u(`div`,null,[u(`h4`,null,`基于角色的访问控制`),u(`p`,{class:`text-g-700 text-sm`},`采用RBAC模型，通过角色分配权限，简化权限管理复杂度。`)],-1))])]),_:1}),l(X,{span:12},{default:p(()=>[u(`div`,B,[u(`div`,V,[l(Y,{size:`20`,color:`#E6A23C`},{default:p(()=>[l(d(e))]),_:1})]),c[15]||(c[15]=u(`div`,null,[u(`h4`,null,`细粒度权限控制`),u(`p`,{class:`text-g-700 text-sm`},`支持页面级、按钮级、数据级等多种粒度的权限控制。`)],-1))])]),_:1}),l(X,{span:12},{default:p(()=>[u(`div`,H,[u(`div`,U,[l(Y,{size:`20`,color:`#F56C6C`},{default:p(()=>[l(d(t))]),_:1})]),c[16]||(c[16]=u(`div`,null,[u(`h4`,null,`安全性优先原则`),u(`p`,{class:`text-g-700 text-sm`},`始终遵循最小权限原则，确保用户只能访问必要的功能和数据。`)],-1))])]),_:1})]),_:1})])]),_:1})])])}}});export{W as default};