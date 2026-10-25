# FinanceVoucherPreview

统一财务单据的凭证预览。传入 `result`（业务提示及借贷分录），通过 ref 的 `handleOpen()` 展示。调用方负责预览权限、接口加载和失败提示；本组件负责科目、摘要、金额格式和缺少配置时的空态。
