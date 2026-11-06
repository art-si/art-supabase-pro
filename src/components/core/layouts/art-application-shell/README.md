# ArtApplicationShell

平台和独立应用共用的整体布局。原有平台入口 `src/views/index/index.vue` 直接消费此组件，菜单、外观和滚动布局只有一份实现。

- 默认复用 ArtSidebarMenu、ArtHeaderBar、ArtPageContent 和 ArtGlobalComponent，保持平台原有行为。
- 独立认证应用通过 `header` 插槽提供自己的账号操作，通过默认插槽提供业务路由内容；这两处不接管公共菜单及布局样式。
- `showGlobalComponents` 默认 true；独立服务端会话应用可设为 false，避免挂载需要平台业务 API 的全局能力。
- `showWorkTab` 默认继承平台设置；独立应用可以显式设为 false。
- 导航数据仍通过主仓 useMenuStore 提供，独立应用从经过后端鉴权的菜单响应转换后设置。权限使用 PlatformAuthContext；身份令牌不进入此组件。
