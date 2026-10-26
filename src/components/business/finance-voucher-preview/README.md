# FinanceVoucherPreview

统一财务单据的凭证预览。传入 `result`（业务提示及借贷分录），通过 ref 的 `handleOpen()` 展示。调用方负责预览权限、接口加载和失败提示；本组件负责科目、摘要、金额格式和缺少配置时的空态。

分录类型统一使用 `@/api/finance-voucher.types`。接口返回原币信息时显示原币、原币金额及原记账汇率；借贷金额使用各行 `baseCurrencyCode`，不能用原币重新换算或把非人民币本位币标成人民币。旧接口未返回原币字段时不补造原币金额。
