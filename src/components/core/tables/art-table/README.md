# ArtTable

项目共用数据表格，承接列配置、字典展示、加载/空态、分页及 Element Plus 表格属性。查询、筛选和专注模式由上层 `ArtTableQuery` 组合。

## 内置编辑与变更集

参考 [vxe-table 编辑模块](https://github.com/x-extends/vxe-table/blob/main/packages/table/module/edit/hook.ts) 和 [校验模块](https://github.com/x-extends/vxe-table/blob/main/packages/table/module/validator/hook.ts) 的职责划分，扩展现有 ArtTable。沿用项目的列配置、Element Plus 控件、校验结果和视觉规范；这是项目自己的接口，不承诺与 vxe-table 全量兼容。

只有传入 `editConfig` 才开启编辑。组件创建独立工作副本，原始 `data` 不被修改。默认双击或 F2/Enter 激活，支持 `cell` / `row` 模式；Tab/Shift+Tab 切换字段，Enter/Shift+Enter 切换同行字段的下一/上一行，Esc 丢弃当前尚未提交的输入。输入法组合输入期间不抢占 Enter。文本编辑在 change/离焦或键盘确认时进入变更集。

```vue
<ArtTable
  ref="tableRef"
  :data="rows"
  :columns="columns"
  :edit-config="{ trigger: 'dblclick', mode: 'cell', historyLimit: 100 }"
  :edit-rules="{ name: [{ required: true, min: 2, message: '名称至少两字' }] }"
  @edit-change="records = $event"
/>
```

```ts
import type { ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
const tableRef = ref<ArtTableExpose<MyRow>>()
const columns: ColumnOption<MyRow>[] = [
  { prop: 'name', label: '名称', editRender: { name: 'input', maxLength: 80 } },
  { prop: 'quantity', label: '数量', editRender: { name: 'number', min: 0, precision: 2 } }
]
```

### 配置

| 配置 | 作用 |
| --- | --- |
| `editConfig.enabled` | 临时禁用编辑；默认开启，未传整个配置时保持普通展示表格 |
| `editConfig.trigger` | `click`、`dblclick`（默认）或 `manual`；manual 通过公开 API 激活 |
| `editConfig.mode` | `cell`（默认）或 `row` |
| `editConfig.beforeEditMethod(context)` | 按行和字段决定能否编辑；加载期间一律禁用 |
| `editConfig.onlyChanged` | 仅展示已修改或临时新增行，不替换原始工作集 |
| `editConfig.historyLimit` | 命令历史上限，默认 100，最大 500 |
| `column.editRender` | `input`、`textarea`、`number`、`select`、`switch`、`date`、`datetime`；支持 `enabled`、条件 `disabled`、`nullable`、`options` 和输入约束 |
| `column.editRender.slot` | 使用 `<名称>-edit` 后缀的自定义编辑插槽（如 `detail-edit`），接收 `{ row, prop, value, update, commit, cancel }`；后缀让 Vue 能区分展示/编辑作用域并推导类型。通过 update/commit 更新，避免直接修改 row |
| `editRules` | 按 prop 配置 required、type、min、max、pattern 或异步 validator；复用既有列 rules 和 validate/validateField/clearValidate |
| `keepSource` | 在未开启编辑 UI 时也保留独立工作集；开启 editConfig 时自动保留原值，无须重复设置 |

字典/复杂显示仍使用既有列配置；普通编辑按钮优先使用返回标量的 formatter 或 select 选项标签。组件不会把含按钮的 VNode 再嵌进编辑按钮。标准规则的 `min/max` 对 number 表示数值边界，对字符串/数组表示长度。

### 公开 API

| API | 结果 |
| --- | --- |
| `setEditCell(row, prop)` / `setEditRow(row)` | 异步激活并聚焦；本地分页时自动定位目标页，返回是否可编辑 |
| `getEditRecord()` / `clearEdit()` | 当前编辑上下文 / 结束编辑 |
| `setCellValue(row, prop, value)` | 经过编辑准入检查更新工作副本 |
| `getTableData()` | 当前完整工作集的深拷贝，包含所有已加载页 |
| `getRecordset()` | `{ insertRecords, removeRecords, updateRecords, changes }`，changes 含 row、original、fields、rowIndex |
| `getInsertRecords()` / `getRemoveRecords()` / `getUpdateRecords()` | 分别读取临时增删改集合 |
| `isUpdateByRow(row, prop?)` | 判断行或字段是否相对原值改变；NULL 与空字符串不同 |
| `revertData(row?, prop?)` | 还原字段、行或全部；全部还原会清空历史 |
| `insertAt(records, target?)` | 本地插入，默认顶部，-1 为末尾，行对象表示该行之前 |
| `remove(rows)` | 仅从本地工作集移除明确指定的行；不执行数据库删除 |
| `undo()` / `redo()` / `canUndo()` / `canRedo()` | 有上限的编辑历史 |

`edit-activated` / `edit-closed` 发出编辑上下文，`edit-change` 发出新的变更集。当前支持平面行和分组列；不自动编辑树子节点、服务端未加载的行或原生插槽列。分页、排序后的行对象由组件保持身份；复杂校验与提交仍归业务层负责。

组件没有内置写入接口。真实业务保存必须调用相应业务 API，继续执行租户、权限、状态及审计规则；把本地 removeRecords 转换为实际删除前，必须使用 MasterDataDeleteGuard 并保留服务端引用校验。

编辑模型将已有自有数据属性优先作为字面字段处理，`__proto__`、`constructor` 和含点的字段也通过安全属性定义修改；撤销、重做和恢复保留同一字面语义。不允许借此创建缺失的危险原型路径，正常嵌套 `prop` 路径保持原有行为。原始 SQL DTO 的精确字段读取另使用 `getOwnRecordValue`，通用单元格 getter 不改变嵌套对象、数组或 Ref 的响应式语义。

## 可选虚拟滚动

默认仍为 `ElTable`。显式传入 `:virtual-scroll="true"` 或 `:virtual-scroll="{ rowHeight: 44, headerHeight: 56, cache: 3 }"`，兼容的平面表格使用独立的 `ElTableV2` 分支。父容器必须有可用高度，也可传入 `height`。`minRows` 可指定启用的行数阈值，`estimatedRowHeight` 用于已验证的动态行高场景。

虚拟分支复用原来的 `el-table` 尺寸类、`el-table__cell` 和内部 `.cell` 样式，统一读取全局紧凑/默认/宽松、表头底色、边框与斑马纹设置。表头和正文灰阶、悬停/选中底色、阴影模式的单元格控件规则共用同一份样式；不单独定义第二套配色。默认单行尺寸与原表格对齐，特殊多行或自定义控件高度仍通过 `rowHeight/headerHeight/estimatedRowHeight` 指定。

复用列配置、formatter、普通/表头/编辑插槽、字典、链接、操作列、列过滤、校验、编辑历史、本地分页和选择事件。公开的选行、排序、滚动、布局方法通过 `elTableRef` 适配；`setEditCell` 会先定位虚拟视区，再激活编辑。原生内部 DOM 和未公开的 ElTable 私有 store 不属于兼容接口。

原生 `ElTableColumn` 默认插槽、分组表头、展开行、树/懒加载、拖拽行、原生列筛选、合计/合并单元格、百分比列宽、原生初始排序、自定义表头/行样式、关闭 fit 及仅 `maxHeight` 的自然增长表格会自动保留 `ElTable`。`getRenderMode()` 返回 `{ requested, virtual, fallbackReason }`，供调用方诊断；不会为了虚拟滚动丢弃这些功能。

SQL 等明确的平铺记录可传入 `virtualScroll.flatData: true`，将 `children` 数组、`hasChildren` 作为普通单元格数据，不触发隐式树回退。仅在实际兼容的虚拟分支中，筛选、校验和行索引也停止对子行递归并保留 JSON；显式树参数或其他不兼容功能仍回退原生，相关树语义不被关闭。普通业务表默认不启用此选项。

虚拟分支发出 `column-layout` 事件，数据类型为 `TableColumnLayout`：`{ viewportWidth, columns: [{ key, width }] }`。它只包含布局元数据，宽度包含弹性分配与用户调整，顺序对应当前可见列；相同布局不会因固定位置或行数据变化重复发送。首次尚未测量时不发零宽，已经测量后隐藏容器可发零宽，恢复后重新报告。调用方可用它做展示空间预算，不需要读取内部 DOM 或私有 store；原生分支不发此虚拟布局事件。

虚拟列宽缓存使用 `Map` 按完整字段 key 读写，`__proto__`、`constructor`、`hasOwnProperty` 等名称也作为普通字段处理，不读取对象原型属性。特殊字段的真实行渲染、键盘/指针改宽、固定、隐藏和重排由 `tests/e2e/table-column-layout.spec.ts` 验证。

`editConfig.editor: 'external'` 是显式外部编辑入口。它只发送带 `cell` 锚点的 `edit-activated`，调用方负责弹层和类型控件，通过 `setCellValue` 保留到本地工作副本。SQL 控制台采用这一模式；默认编辑器仍为原有行内编辑。校验 API 可传 `{ focus: false }` 更新错误而不抢夺弹层焦点，默认仍定位第一处错误。

## 本地分页

`client-pagination` 是显式选择：在当前已加载工作集上按 `pagination.current/size` 切片，复用既有分页事件和全局分页样式。切页不重新加载数据，不清除编辑历史；筛选改变时会校正页码。其余服务器分页页面保持原来的数据与请求流程。启用本地分页的表格使用可用高度布局，底部分页固定可见，行在内部滚动。

`loading` 为 `true` 时，表格在首次加载和已有行的刷新期间都显示共享加载遮罩，并暂时禁用分页。请求结束后由调用方在 `finally` 中关闭加载状态。仅对确实需要保留旧行交互的特殊场景使用 `:loading-overlay="false"`。

默认分页布局和页码数量随窗口宽度更新，窗口缩放保留当前页。调用方通过 `paginationOptions.layout` 或 `paginationOptions.pagerCount` 显式指定时，以调用方配置为准。

可排序列自动保留至少 100px，并按标题长度增加最小宽度，确保标题与排序箭头保持同一行。业务列可配置更大的宽度；过窄的 `width` 和 `minWidth` 由公共表格统一补足。

数据清空后，表格自动将横向滚动复位到起点，避免空表头停留在末尾列。固定高度编辑表可同时指定 `height` 和 `emptyHeight`（例如 `:height="390" empty-height="390px"`），让有数据与空态保持相同高度。自定义 `empty` 插槽中的操作按钮也必须完整可见。

## 文本列查看入口

在主内容列配置 `link`，即可把单元格渲染为主题色链接式按钮。`onClick` 应复用同行“查看”按钮的处理函数，确保打开同一详情。`permission` 与原查看操作保持一致；没有权限、禁用或值为空时，单元格显示普通内容。复合 `formatter` 可使用此属性，但内容不得再包含按钮或链接；带嵌套操作的单元格仍由业务组件明确放置链接。

附件名称列使用 `link: attachmentTableLink`（从 `@/components/core/media/art-file-viewer/table-link` 导入），统一点击预览及无地址、协议不受支持时的禁用状态。有效地址限 HTTP(S)、相对地址与同源 Blob。不要同时使用 `renderAttachmentLink` 一类会生成内层链接的 formatter。

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

通过 `headerTooltip: '长度必须大于 0 mm'` 为列标题添加填写说明。普通列、分组列和虚拟表头统一展示帮助图标，鼠标悬停或键盘聚焦可查看说明，无需为帮助提示创建表头插槽。

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

字段错误以控件红框表示，业务提交方用返回的 `firstError.message` 显示消息提示。普通、分组和虚拟表格均不在单元格下追加可见错误文字，避免撑高行；辅助阅读器仍能读取错误说明。列旁的 `headerTooltip` 用于解释填写规则。

## 窄容器与固定列

默认在实际表格容器宽度小于 640px 时解除列的固定定位，所有字段和操作仍按原顺序保留，通过表格内部横向滚动访问。容器恢复到 640px 及以上时恢复原配置；不修改用户的列选择、顺序或存储值。使用容器测量而不是窗口宽度，因此分栏、抽屉和专注模式也适用。

`fixed-column-min-width` 可以设置阈值；`0` 关闭这项行为，仅适用于已单独验证窄屏布局的表格。`ArtTableQuery` 可通过 `tableProps.fixedColumnMinWidth` 传入。该策略适用于 `columns` 配置渲染的普通列、分组列和全局序号列；直接通过插槽提供的原生 `ElTableColumn` 仍由调用方负责。

固定列不应遮住其他单元格。不得通过隐藏有效操作、覆盖全局 sticky 样式或把整页横向撑开解决窄屏问题。操作列宽度仍应与实际控件数量相符，响应式解除固定不能替代合理的列宽设计。

虚拟分支通过生成列的稳定 key 解析原始列与索引，不能用固定子表或重排后的局部 `columnIndex` 索引原始列数组。第三列固定到左侧、末列固定到右侧时，表头点击/右键、单元格样式和校验仍须对应实际字段。`tests/e2e/table-virtual-fixed-identity.spec.ts` 验证这些身份和窄容器解除固定；640px 阈值本身不提供固定列总宽预算保护。

Table V2 会以排序处理覆盖 `headerCellProps.onClick`，适配层通过表头行的自然冒泡委托派发表头点击；排序继续工作，调整列宽、全选及自定义表头按钮可以通过 `stopPropagation` 保留自己的点击边界。

列宽握柄保留在表头现有右侧留白中，避免被单元格溢出裁剪缩成细线。回归逐像素检查普通区和左右固定区的命中范围，并从握柄中心真实拖动，验证公开布局事件与实际列宽同步；不通过强制点击跳过命中检查。布局元数据回归位于 `tests/e2e/table-column-layout.spec.ts`，握柄与固定区交互回归位于 `table-virtual-fixed-identity.spec.ts`。

操作列按可见按钮本身的宽度、控件间距、单元格留白和滚动条空间计算，最低 64px。不要测量被当前列宽拉伸的操作容器，否则增删行触发重新布局时会重复累加旧列宽。单个更多按钮和带序列号按钮的明细表均有连续删行回归。

回归包含人员工作台中的姓名可读性、横向访问操作、容器缩放恢复，以及专注模式进入、按钮退出与 Esc 退出；使用浏览器隔离数据，不写入业务库。

仅设置 maxHeight 的表格按内容自然增长，由 Element Plus 限高并计算含表头、合计行和滚动条的可视区域，不同时传入 100% 高度。显式 height 和页面全屏填充仍保留。滚动条不持续显示，使用 Element Plus 默认的悬停显示行为。

展开行内容默认限制在表格可视宽度内，随容器缩放，横向滚动时仍可访问。业务展开表单按可视宽度分列，不应按整张宽表拉长输入框。可展开的明细表优先使用 maxHeight，使少量数据与展开内容自然撑开；空状态切换到数据状态时公用表格会清除旧高度。展开输入框获取焦点仅定位实际控件，不滚动整张跨列单元格；普通单元格与校验错误定位保持有效。

## 主列表列配置目录

`ArtTable` 和 `useTableColumns` 统一读取当前菜单的有效列方案。业务页面继续保留自己的列工厂、格式化、权限判断与数据查询；目录只记录展示元数据，不会生成未授权的业务列。

生成器始终把目录和清单写入仓库根目录，输入快照路径则按调用时的工作目录解析。

从当前 `sys_menu` 导出菜单快照（`id/component/type/path/parent_id`）后运行 `pnpm exec tsx scripts/generate-table-column-catalog.ts <菜单快照.json>`，更新两个 `src/config/table-column-*.generated.json` 文件；不要手工维护目录。必须显式传入当前快照；无参调用或无效快照会在写入前报错，避免自动使用旧备份覆盖新目录。生成器跟踪实际路由、包装组件的静态 props、动态工作区、条件分支、循环及 `push/splice` 生成的列；运行期的权限、标签页与单据/明细模式保留所有可达列。同页多张主表通过 `groups` 分别匹配，分组子列通过 `parentKey` 关联，不能把子列数算进顶层主表匹配门槛。弹窗、抽屉、选择器、对象详情与附件表不作为主列表注册。

运行期选择条件按完整工厂生成各模式的分组，公共列同时属于对应分组；保留未显式比较的默认分支。字段权限控制的列标记为 `optional`，不计入主表必需列的覆盖率，但仍必须属于目录；实际可见列始终由业务工厂授权，保存的方案不能生成缺少权限的列。`operation` 以及标题为“操作”的 `action` 列受结构保护，不允许通过列方案隐藏。

分组 `prop` 使用稳定的业务标识；勾选数量口径时只改变 `children`。表格根据可见子列成员重新挂载分组，避免 Element Plus 缓存旧表头。月度日历使用 `day01`～`day31`，仅渲染当月有效日期，取数仍使用真实年月日；目录不能固化生成时的月份。

发布更新后，在“列配置”执行“同步目录”，更新当前主列表的元数据并保留已有平台、租户、角色和用户方案。核验业务页改名、显隐、排序、切回前端定义、读取失败回退，以及权限变化和数量/月份切换。对应回归见 `table-column-catalog`、`column-profile`、`wms-inventory-column-config` 单测及物料、库存、设备日历浏览器用例。

2026-10-31 全局核验：扫描当前 500 个菜单入口，登记 431 个列表、6549 列；其余 68 个入口没有可配置主列表，另排除列配置控制页本身。相对原 400 项目录，新增 32 项（TMS 19、VMS 7、FMS 2、MDM 2、MES 1、数据中心 1），移除 1 项附件详情误登记。计量单位从 2 列补全为 10 列；同时补全物料参考、运营主数据、运单、HR 标签页、审批/治理/项目仓/账簿多主表、采购销售与财务单据/明细模式、库存数量分组及设备日历。远端目录逐项核对与生成文件一致，已有 7 份列方案的完整内容指纹保持不变。
