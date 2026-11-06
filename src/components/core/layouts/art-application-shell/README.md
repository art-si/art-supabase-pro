# ArtApplicationShell

平台和独立应用共用的整体布局。原有平台入口 `src/views/index/index.vue` 直接消费此组件，菜单、外观和滚动布局只有一份实现。

- 默认复用 ArtSidebarMenu、ArtHeaderBar、ArtPageContent 和 ArtGlobalComponent，保持平台原有行为。
- 独立认证应用通过 `PlatformAuthContext.account` 提供用户与退出回调，直接复用原顶栏和头像菜单，不需要另写一套界面。`header` 和默认插槽仅用于有明确组合需求的宿主。
- `showGlobalComponents` 默认 true；独立服务端会话隐藏需要 pro 业务 API 的账号功能，公共设置、搜索等继续使用原实现。
- `showWorkTab` 默认继承平台设置；独立应用可以显式设为 false。
- 导航数据仍通过主仓 useMenuStore 提供，独立应用从经过后端鉴权的菜单响应转换后设置。权限使用 PlatformAuthContext；身份令牌不进入此组件。
