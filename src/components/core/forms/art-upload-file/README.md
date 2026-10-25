# ArtUploadFile

通用文件附件上传组件。统一处理文件大小校验、上传状态、错误提示、附件列表与 URL 模型同步。

```vue
<ArtUploadFile
  v-model="attachmentUrls"
  multiple
  :limit="8"
  accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,image/*"
  tip="支持文档、压缩包和图片，单个文件不超过 20 MB"
/>
```

- 普通文件、文档和压缩包使用本组件。
- 默认显示连体附件按钮：主按钮上传本地文件，右侧箭头展开“从资源库选择”。资源库选择后仍可直接上传或粘贴本地文件。特殊场景可传 `:show-resource-picker="false"`。单文件选择会替换当前附件；多文件选择会追加并按 `limit` 去重。资源选择同样校验 `accept`。
- 组件默认绘制附件区虚线外框，外框 hover 高亮默认开启；传 `:hover-effect="false"` 可关闭悬停高亮。放在分区标题右侧的紧凑操作可传 `inline` 去掉外层虚线框与内边距，保留附件组合按钮自身的交互反馈。普通表单附件区保持默认外框。
- 本地上传模式下可点击附件区并按 `Ctrl+V`（Mac 为 `⌘V`）粘贴图片或文件。粘贴与选择文件共用 `accept`、`file-size`、`limit`、上传状态及 `upload-request`；仅在可编辑且未禁用时生效。
- 跨租户表单应传 `resource-tenant-id`，本地上传和资源管理器选择都使用业务记录的目标租户。平台管理员处于“全部租户”时，未提供目标租户的本地上传会提示先选择租户。单文件表单可传 `file-name` 显示业务文件名，避免将存储对象的哈希名展示给用户。
- 图片预览上传使用 `ArtUploadImage`。
- 结构化 Excel 导入使用 `ArtExcelImport`。
- 仅需要资源事件时可关闭 `show-file-list`，监听 `resource-change` 获取本地上传或资源管理器选择的资源信息；`upload-success` 仅在本地上传成功时触发。
- 需要专用私有存储的业务可传 `upload-request`，由业务 API 返回标准资源记录；同时关闭资源管理器选择，避免混用公共附件。
- 附件名称点击后统一进入公共文件预览页；附件行右侧提供下载、查看和删除操作。
- `readonly` 模式不显示上传触发器和删除操作，仅保留附件名称、下载与查看。
