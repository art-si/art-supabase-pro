# ContractDocumentPreview

电子合同与运输协议共用的只读纸张预览。调用 `handleOpen(document: ContractDocument)`；调用方从授权详情映射文书抬头、有效期、双方、业务摘要、正文、附件、证照和签署记录。组件克隆快照，使用 DOMPurify 清理正文，并复用附件和图片预览控件。

`ContractDocument` 在 `types.ts` 定义。文书使用白纸深色文字，保留真实签名与印章图片；数据获取、预览权限及不可变签署快照由调用方和服务端负责。
