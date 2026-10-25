# BusinessWorkspaceHeader

业务首页、列表工作区、运营工作台和模块首页的统一头部。创建、编辑、详情和配置流程请使用 `ArtPageHeader`。

窄屏（640px 及以下）中，标签和操作区使用头部完整的内容宽度，不再保留图标列的左缩进。默认和紧凑密度共享此规则，业务页无需添加移动端宽度覆盖。

操作区在所有断点保持右对齐，按钮组换行后仍靠右。标签作为上下文信息可独立排布；业务页不要覆盖公共操作区为左对齐。

## 基础用法

```vue
<BusinessWorkspaceHeader
  eyebrow="PEOPLE DIRECTORY"
  title="员工花名册"
  description="统一维护员工身份、任职状态与人事履历。"
  icon="ri:contacts-book-3-line"
  :tags="workspaceTags"
  :metrics="workspaceMetrics"
>
  <template #actions>
    <ElButton type="primary">新增员工</ElButton>
  </template>
</BusinessWorkspaceHeader>
```

## 指标交互

指标默认以只读概览展示。需要用指标筛选下方列表时，设置 `interactive`、`selected` 和稳定的 `key`，并监听 `metric-click`：

```vue
<BusinessWorkspaceHeader :metrics="metrics" @metric-click="handleMetricClick" />
```

```ts
const metrics: BusinessWorkspaceMetric[] = [
  {
    key: 'overdue',
    label: '已逾期',
    value: 8,
    description: '需要立即确认并处置',
    icon: 'ri:alarm-warning-line',
    tone: 'danger',
    interactive: true,
    selected: true,
    loading: false
  }
]
```

交互指标会自动提供按钮语义、键盘焦点、`aria-pressed`、主题色以及 `border-mode` / `shadow-mode` 对应的选中反馈。

## 类型

- `BusinessWorkspaceTag`：特性标签。
- `BusinessWorkspaceMetric`：概览指标；支持 `key`、`tone`、`interactive`、`selected` 和 `loading`。
- `actions` 插槽：放置该工作区的主要操作。

列表页不要在 `actions` 插槽重复实现表格动作。将同一份 `ArtTableQuery.headerActions` 通过 `BusinessTableWorkspaceActions` 挂载到头部，专注模式会自动把动作移回表格：

```vue
<template #actions>
  <BusinessTableWorkspaceActions :table="tableQueryRef" />
</template>
```
