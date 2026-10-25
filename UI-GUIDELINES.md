# 项目 UI 一致性规范

## 规范优先级与辅助审查

`AGENTS.md` 和本地 `professional-ui-quality` 是 UI 质量的主规范，`art-supabase-pro-conventions` 决定组件与页面结构。项目适配版 `impeccable` 补充审查、层级分析、精修、状态补全和文案检查方法，不建立新的设计系统。

使用 `$impeccable audit <范围>` 检查实现质量，使用 `$impeccable critique <范围>` 分析任务层级和认知负担，使用 `$impeccable polish <范围>` 执行已授权的局部精修。先读取 `.agents/skills/impeccable/SKILL.md`；审查只输出问题，精修保留现有身份和业务行为。检测器提示必须结合业务语义复核，不能把合法的状态提示、菜单选中线、表格内部滚动或后台信息密度直接当成缺陷。

Art/Element Plus 组件、项目主题与动效令牌、租户和按钮权限、删除引用保护及浏览器验证门禁始终优先。本次接入没有安装自动 Hook；上游启动器和其他命令保留为可选资源，不自动扩展工作范围。

## 业务组件边界

业务页面统一使用项目封装组件：

- 弹窗使用 `ArtDialog`，抽屉使用 `ArtDrawer`。
- 列表使用 `ArtTable`；带查询条件和分页的列表优先使用 `ArtTableQuery`。
- 表单使用 `ArtForm`。复杂品牌配置、可视化编排等特殊布局使用 `custom-layout`，校验和 Ref API 仍由 `ArtForm` 承载。
- 登录、注册、示例和组件演示页允许直接使用 Element Plus 原生容器。

运行 `pnpm ui:audit` 可检查业务页面是否重新引入原生 `ElDialog / ElDrawer / ElTable / ElForm / ElDescriptions`，并阻止弹层重新写死像素尺寸。复杂详情值通过 `ArtDescriptions` 的 `render` 配置或具名插槽呈现，不回退到原生详情容器。

## 页面结构

- 标准页面使用 `ArtPageShell` 统一加载、错误、空数据和完成态。
- 业务列表、工作台与模块首页使用 `BusinessWorkspaceHeader`；创建、编辑、详情或配置流程的标题与返回操作使用 `ArtPageHeader`。
- 有标题且需要加载、空数据或错误态的内容区块使用 `ArtSectionCard`；已有表面内的无边框分区使用 `ArtPageSection`。`art-card-xs` 仅用于无标题紧凑表面和固定操作区，避免页面各自定义卡片外观。
- 长编辑页底部操作使用 `ArtStickyActionBar`，主操作保持唯一、明确。
- 详情字段优先使用 `ArtDescriptions`，统一响应式列数、空值、字典、金额和时间格式。

## 视觉令牌

- 间距使用 `--art-space-*`、`--art-page-padding`、`--art-section-padding`。
- 控件、卡片、强调图形、浮层、弹窗圆角分别使用 `--art-control-radius`、`--art-surface-radius`、`--art-feature-radius`、`--art-floating-radius`、`--art-modal-radius`。
- 弹窗和数据选择弹窗使用 `sm / md / lg / xl / full` 尺寸预设，抽屉使用同名预设，只有业务确有必要时才传自定义宽度。
- 内容滚动优先使用 `ElScrollbar` 或 Art 弹层的 `contentHeight / contentMaxHeight`。

## 交互反馈

- 危险确认、普通确认和文本输入通过 `useArtFeedback` 调用：业务原因使用 `promptReason`，普通文本编辑使用 `promptText`；业务页不得直接调用 `ElMessageBox.prompt`。
- 业务确认使用 `confirmAction`；单条和批量删除先经 `MasterDataDeleteGuard` 检查引用，再执行删除确认。引用检查失败必须阻止删除，并在并发引用拒绝后重新检查；业务页不得直接调用 `ElMessageBox.confirm`。
- 原因输入默认使用统一 textarea、200 字上限和非空校验；特殊场景通过 Hook 参数调整初始值、最大字数或是否允许留空。
- 异步页面必须覆盖加载、错误、空数据和成功反馈，不用空白区域表达状态。
- 操作按钮按“主操作、次操作、危险操作”排序；同一区域只保留一个主按钮。

## 提交前检查

```bash
pnpm ui:audit
pnpm typecheck
pnpm lint
```

涉及布局或样式的修改还需在真实浏览器中检查桌面宽屏、常规笔记本和窄屏三种尺寸。
