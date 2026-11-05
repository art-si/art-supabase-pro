# ContractSigningDialog

电子合同与运输协议共用的签署流程。通过 `handleOpen({ title, documentNo, tenantId, partyAName, partyBName, onSubmit })` 打开；签署成功发出 `success`。

字段通过 ArtForm 元数据配置，甲乙双方分别至少提供手写签名或授权印章一项。手写控件支持鼠标、触屏和上传图片。确认签署时持久化画布，再把四个凭据 URL 传给 `onSubmit`；失败保留输入，允许重试。关闭或再次打开后，旧上传不会触发新文书签署。

服务端必须再次检查租户、按钮权限、审批结果、资源归属及不可重复签署，并记录签署时间、操作者和锁定文书。此组件不选择审批流程或直接修改业务状态。
