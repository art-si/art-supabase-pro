# ReceivableReceiptConditions

MDM 收款条件维护工作区。由主仓库应收 API 提供租户隔离的读取、保存及引用检查。新增与编辑使用 ArtDialog/ArtForm；删除必须先通过 MasterDataDeleteGuard，无权限或检查失败时停止删除。
