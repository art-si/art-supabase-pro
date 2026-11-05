# ArtSignaturePad

通用手写签名控件。`ArtForm` 中使用 `type: 'signature'`，通过 `props.resourceTenantId` 指定文书所属租户。支持鼠标、触屏手写、清除及通过 `ArtUploadImage` 上传已有签名图片；上传路径提供键盘可操作的替代方案。

`v-model` 为 PNG data URL（未持久化的画布）或已上传的资源 URL。提交边界调用同目录 `persistSignatureImage(value, tenantId)`，通过统一附件 API 将画布保存为租户资源；空值或资源 URL 保持原值。业务服务端仍须校验资源存在、归属及对应签署权限。

`disabled` 防止提交期间编辑。画布不自动生成姓名或印章，也不代替双方授权与审批。
