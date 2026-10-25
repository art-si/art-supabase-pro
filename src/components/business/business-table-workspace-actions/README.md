# BusinessTableWorkspaceActions

业务列表头部的统一表格控制与操作宿主。组件通过 `ArtTableQueryExpose` 连接表格，不复制动作执行逻辑。

```vue
<BusinessWorkspaceHeader title="客户资料" description="..." icon="ri:user-star-line">
  <template #actions>
    <BusinessTableWorkspaceActions :table="tableQueryRef" />
  </template>
</BusinessWorkspaceHeader>

<ArtTableQuery
  ref="tableQueryRef"
  :header-actions="headerActions"
  header-actions-placement="workspace"
  focusable
/>
```

复合页面只有部分视图使用表格时，可在非表格视图隐藏“显示工具栏”和“专注模式”，同时保留挂载到页头的业务操作：

```vue
<BusinessTableWorkspaceActions
  :table="tableQueryRef"
  :show-display-controls="viewMode === 'list'"
/>
```

- 普通状态：非批量操作挂载到 `BusinessWorkspaceHeader`，表格不保留空工具栏行。
- 勾选状态：批量操作仍在表格选择条显示，工作区头部的非批量操作保持可用。
- 专注状态：非批量操作回到表格左侧，右侧完整工具栏强制显示。
- 退出专注：恢复进入前的“显示工具栏”设置和工作区头部布局。
