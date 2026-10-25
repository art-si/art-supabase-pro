# ArtTable

项目共用数据表格，承接列配置、字典展示、加载/空态、分页及 Element Plus 表格属性。查询、筛选和专注模式由上层 `ArtTableQuery` 组合。

`loading` 为 `true` 时，表格在首次加载和已有行的刷新期间都显示共享加载遮罩，并暂时禁用分页。请求结束后由调用方在 `finally` 中关闭加载状态。仅对确实需要保留旧行交互的特殊场景使用 `:loading-overlay="false"`。

默认分页布局和页码数量随窗口宽度更新，窗口缩放保留当前页。调用方通过 `paginationOptions.layout` 或 `paginationOptions.pagerCount` 显式指定时，以调用方配置为准。

可排序列自动保留至少 100px，并按标题长度增加最小宽度，确保标题与排序箭头保持同一行。业务列可配置更大的宽度；过窄的 `width` 和 `minWidth` 由公共表格统一补足。

数据清空后，表格自动将横向滚动复位到起点，避免空表头停留在末尾列。固定高度编辑表可同时指定 `height` 和 `emptyHeight`（例如 `:height="390" empty-height="390px"`），让有数据与空态保持相同高度。自定义 `empty` 插槽中的操作按钮也必须完整可见。

## 文本列查看入口

在主内容列配置 `link`，即可把单元格渲染为主题色链接式按钮。`onClick` 应复用同行“查看”按钮的处理函数，确保打开同一详情。`permission` 与原查看操作保持一致；没有权限、禁用或值为空时，单元格显示普通内容。复合 `formatter` 可使用此属性，但内容不得再包含按钮或链接；带嵌套操作的单元格仍由业务组件明确放置链接。

附件名称列使用 `link: attachmentTableLink`（从 `@/components/core/media/art-file-viewer/table-link` 导入），统一点击预览和无地址时的禁用状态。不要同时使用 `renderAttachmentLink` 一类会生成内层链接的 formatter。

```ts
{
  prop: 'name',
  label: '名称',
  link: {
    permission: 'Example:View',
    onClick: (row) => openDetail(row),
    title: (row) => `查看${row.name}详情`
  }
}
```

## 编辑表格必填列

编辑型表格通过列配置的 `required: true` 声明必填列。`ArtTable` 会在标题前统一渲染与表单一致的红色星号，并为辅助技术补充“必填”语义；不要在 `label` 中手写 `*`。

```ts
const columns: ColumnOption<EditableRow>[] = [
  { prop: 'quantity', label: '用量', required: true, formatter: renderQuantity },
  { prop: 'unitId', label: '单位', required: true, formatter: renderUnit }
]
```

`required` 同样支持分组子列和 `useHeaderSlot` 自定义表头。调用 `ArtTable` 暴露的 `validate()` 后，组件统一校验所有必填列、标红无效控件并聚焦第一处错误；用户修正字段后会即时移除对应错误状态。

需要业务规则时，通过列的 `rules` 传入校验器，表格只负责执行与展示，不包含领域规则：

```ts
{
  prop: 'quantity',
  label: '用量',
  required: true,
  requiredMessage: ({ rowIndex }) => `第 ${rowIndex + 1} 行用量不能为空`,
  rules: {
    validator: ({ value }) => Number(value) > 0,
    message: ({ rowIndex }) => `第 ${rowIndex + 1} 行用量必须大于 0`
  }
}
```

```ts
const result = await tableRef.value?.validate()
if (!result?.valid) ElMessage.warning(result?.firstError?.message)

tableRef.value?.clearValidate()
await tableRef.value?.validateField(['quantity', 'unitId'])
```

`validate()` 和 `validateField()` 返回 `{ valid, errors, firstError }`。集合级规则（例如至少一行、跨行去重）仍由业务组件负责；字段级必填、范围和条件校验统一交给 `ArtTable`。

## 窄容器与固定列

默认在实际表格容器宽度小于 640px 时解除列的固定定位，所有字段和操作仍按原顺序保留，通过表格内部横向滚动访问。容器恢复到 640px 及以上时恢复原配置；不修改用户的列选择、顺序或存储值。使用容器测量而不是窗口宽度，因此分栏、抽屉和专注模式也适用。

`fixed-column-min-width` 可以设置阈值；`0` 关闭这项行为，仅适用于已单独验证窄屏布局的表格。`ArtTableQuery` 可通过 `tableProps.fixedColumnMinWidth` 传入。该策略适用于 `columns` 配置渲染的普通列、分组列和全局序号列；直接通过插槽提供的原生 `ElTableColumn` 仍由调用方负责。

固定列不应遮住其他单元格。不得通过隐藏有效操作、覆盖全局 sticky 样式或把整页横向撑开解决窄屏问题。操作列宽度仍应与实际控件数量相符，响应式解除固定不能替代合理的列宽设计。

操作列按可见按钮本身的宽度、控件间距、单元格留白和滚动条空间计算，最低 64px。不要测量被当前列宽拉伸的操作容器，否则增删行触发重新布局时会重复累加旧列宽。单个更多按钮和带序列号按钮的明细表均有连续删行回归。

回归包含人员工作台中的姓名可读性、横向访问操作、容器缩放恢复，以及专注模式进入、按钮退出与 Esc 退出；使用浏览器隔离数据，不写入业务库。

仅设置 maxHeight 的表格按内容自然增长，由 Element Plus 限高并计算含表头、合计行和滚动条的可视区域，不同时传入 100% 高度。显式 height 和页面全屏填充仍保留。滚动条不持续显示，使用 Element Plus 默认的悬停显示行为。

展开行内容默认限制在表格可视宽度内，随容器缩放，横向滚动时仍可访问。业务展开表单按可视宽度分列，不应按整张宽表拉长输入框。可展开的明细表优先使用 maxHeight，使少量数据与展开内容自然撑开；空状态切换到数据状态时公用表格会清除旧高度。展开输入框获取焦点仅定位实际控件，不滚动整张跨列单元格；普通单元格与校验错误定位保持有效。
