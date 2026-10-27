# 运输三主线查询模型

## 权威实体与关联

订单、车辆、司机分别以 `tms_order.id`、`mdm_vehicle.id`、`mdm_driver.id` 为主键。运输执行由 `tms_waybill` 承载，一张执行运单关联一台车辆和一名司机；`tms_waybill_order_allocation` 将订单和执行运单连接，因此同一订单可展开多车、多司机。只对没有分配行的旧运单回退到 `tms_waybill.order_id`，避免重复关系。

订单上的 `dispatch_vehicle_id`、`dispatch_driver_id` 只用作主车主驾摘要。实际承运、当前状态与历史关系以执行运单为准，不把车辆或司机 ID 数组复制进订单。

## 只读边界

- `tms_list_transport_mainline_relations_secure` 以订单、车辆或司机定位执行关系，按进行中优先及最近活动分页。每次读取均按认证用户和当前租户范围过滤，联接同时核对 `tenant_id`。
- 综合查询的“承运订单与车辆明细”复用该关联主键，补充与已配载运单一致的线路、调度、地址、节点时间、货物和费用字段。货量与执行运费优先取 `tms_waybill_order_allocation` 的本订单分配行；没有可靠分配时不把合单整笔运费复制到每张订单。旧拆单缺分配行时，重量/方量从执行运单取，无法确认的逐行数量留空，货类优先回退本订单货物。订单级保费/配送费/卸货费只是报价参考，多车行不能相加。扩展字段仅在调用者另有订单详情或已配载运单查看权限时投影，并经 `tms.waybill` 字段权限处理；仅有司机/车辆综合查询查看权仍能读取基础三角关系，但不能借此取得订单地址与金额。安全订单投影按当前页的去重订单 ID 计算一次，避免拆单时逐行重复查询。发布前函数定义保存在忽略目录 `.artifacts/mainline-rich-relation-before-20261027.sql`，SQL 先在目标库 `BEGIN/ROLLBACK` 预演，再直接替换原函数；`tests/integration/tms-mainline-rich-detail.sql` 验证分配行货量/运费、字段权限、仅车辆权限用户的丰富字段阻断及四类租户范围，原 `tms-transport-mainline.sql` 继续通过。安全顾问只有该已授权 `SECURITY DEFINER` RPC 的既有通用提示，性能顾问没有新增本函数提示。
- `tms_list_current_driver_mainline_relations_secure` 独立读取已发车且未完成的司机执行关系，并单独分页；司机详情的“当前出车”因此不会随历史承运记录翻页而消失。原主线关系 RPC 的签名和行为保持不变。
- 订单、司机、车辆综合页面沿用原业务安全列表和详情接口；新增查询菜单与 `View`/`Export` 按钮权限在数据库边界生效。平台超级管理员选定租户时仍只读该租户，普通用户伪造租户请求无效。
- `tms_get_order_mainline_finance_secure` 只返回订单明确关联的客户对账行和异常。对账单整单回款不能自动分摊到一张订单。
- `tms_list_mainline_costs_secure` 按明确车辆执行运单或费用单指定司机读取费用，沿用 FMS 金额字段脱敏。合并运单的整笔费用不重复计成各订单成本。
- 司机“费用明细”分别展示明确 `driver_id` 的运单费用，以及经 `mdm_driver.employee_id` 精确关联的借款、还款、费用报销；每类由对应财务查看权限独立控制和分页，不按姓名匹配。订单“费用明细”通过 `tms_list_order_mainline_costs_secure` 读取其执行运单费用，合单整运单费用标为多单共用，不作为单一订单独占成本。现有借款、还款与报销单没有订单外键，因此不把司机个人记录推定为某张订单的费用。
- `vms_list_vehicle_fuel_execution_secure` 从执行记录读取油量与里程。缺数据、未完成或里程区间冲突时保留“待核算”，不把未知值显示为零。
- 司机资质、培训、违章和事故由各自的安全来源按 `employee_id` 或 `driver_id` 关联，保持 HR/VMS 查看权限。
- `tms_get_driver_compensation_secure` 先按司机 ID 找到同租户的员工 ID，再读取已批准且当前生效的 HR 基础薪酬方案。调用者必须同时拥有司机综合查询、HR 薪酬查看及金额查看权限；无员工关联或无生效记录时返回明确空态，不按姓名推测工资，也不把基础薪酬当作实际发薪。

## 页面与验证

入口为 `/tms/order-query`、`/tms/driver-query`、`/vms/vehicle-query`；详情路径在末尾追加 `/detail/:id`。`/tms/mainline-screen` 展示管理层汇总态势。列表按主实体分页，详情按执行关系继续分页；导出复用各来源的安全导出范围。

订单与司机综合详情采用与既有运单详情一致的下划线页签。总览只保留身份、风险和当前跟踪；“承运订单与车辆明细”在单独宽表中横向滚动核对订单号、调度运单、车牌、司机、线路、调度、地址、节点时间、货物及费用字段；费用、合同/报价、交付/对账和异常分开呈现。首屏订单主体不等待未选页签的合同、报价或财务请求完成，关联追踪与历史分页保持独立。

现有集成检查包括 `tests/integration/tms-transport-mainline.sql`、`tms-mainline-rich-detail.sql`、`tms-mainline-menu-contract.sql`、`tms-mainline-operating.sql`、`tms-driver-mainline-evidence.sql`、`tms-driver-current-mainline.sql`、`tms-driver-compensation.sql`、`tms-driver-finance.sql`、`tms-order-mainline-costs.sql`、`tms-order-contract-link.sql` 和 `vms-vehicle-query-export.sql`。隔离浏览器测试使用合成的两单、两车、两司机；QA 租户另保留两条真实主实体和三条执行关联用于租户范围验证。

油卡档案与油卡流水现在由 `vms_fuel_card`、`vms_fuel_card_entry` 独立承载。每张卡必须绑定同租户且已审核的 `mdm_vehicle`；卡号在租户内不区分大小写唯一。期初余额、充值、消费、冲正均形成不可改写的流水，余额由有符号流水汇总；消费或冲正不能造成负余额。受控写 RPC 先锁定卡行再核算余额，并更新卡行版本，使并发扣款串行化或触发数据库序列化重试；停用卡不接受新流水。油卡消费不自动生成 FMS 费用，避免与运单费用重复记账；执行加油量也不作为卡流水。

每张订单可在开单时明确选择一份客户合同，也可暂不选择。`tms_order.contract_id` 使用同租户复合外键；受控写入校验客户一致、合同类型、首次关联时的审批和有效期，并阻止同一订单的运价明细混用其他合同。现有合同字段 `business_contract_type='carrier'` 表示发起方为承运商，其相对方是客户，因此此类合同才可供运输订单选择。历史订单不按客户或线路猜测合同。综合查询只展示明确关联的合同；合同删除引用检查展示关联订单号和状态。

无合同价格查看权限时，明细单价显示为“—”，保留订单原运费而不把受遮蔽的空值当作 0 自动回写。合同候选、明细或摘要读取失败进入错误和重试状态，不当作未关联合同。

订单合同发布新增了 `tms_order.contract_id`、`tms_contract(id, tenant_id)` 唯一约束、同租户复合外键、部分索引和关联触发器，以及开单/改单包装、候选合同、合同明细、综合摘要、删除引用等六个受控 RPC；原订单核心 RPC 保持不变。事务回滚集成测试使用既有已审批合同，验证一单关联、一单留空、跨客户和混合同拒绝、删除外键阻止、到期历史关联仍可读，以及平台全部/选定/普通/伪造租户范围。若要撤销，先停止新的订单合同写入口并保全已有订单关联，再按依赖反序移除新增 RPC 和触发器、复合外键、索引、订单列与合同复合唯一约束；有真实订单已关联时不得直接删列。

现有两份已审批客户合同与 QA 主线两单分属不同租户，QA 租户没有合同，因此不把它们跨租户关联，也不向真实业务租户追加合成订单。合同选中/留空的两单界面由隔离浏览器夹具验证，创建、切换和移除合同由事务回滚集成测试验证；线上原有订单的 `contract_id` 继续为空，直到业务用户按正常开单/改单流程明确选择。

油卡读权限分别为 `FuelCardArchive:View` 和 `FuelCardLedger:View`，导出需各自 `Export` 权限；新增卡、启停、充值、消费、冲正由对应按钮权限单独控制。`vms_list_fuel_cards_secure` 与 `vms_list_fuel_card_entries_secure` 重复执行规范租户范围判断，平台全部、平台选定及普通用户租户规则相同。写操作以绑定车辆或已有卡的租户为准，普通用户不能借伪造租户头跨租户写。表只向已认证角色开放 SELECT，且有规范 RLS；没有直接表写授权。车辆综合查询的油卡页签遵守这两个模块的独立查看权限。

油卡对车辆存在阻止删除的外键。`vms_get_master_delete_dependencies_secure` 已把油卡以 `vehicle_fuel_card`、卡号和启停状态加入车辆 `MasterDataDeleteGuard`，`cleanup_allowed=false`；具备油卡查看权限时可导航到卡片记录。回滚事务验证了删除前检查会返回刚关联的卡，且测试卡在结束后为零。部署前该函数无 `vehicle_fuel_card` 分支；若需恢复先确认没有真实卡，再用部署前函数定义移除新增分支，现有其他删除引用逻辑不变。

车辆删除 RPC `vms_delete_vehicle_archives_secure` 同时改为对目标车辆和关联运单使用规范租户读取范围：平台选定租户不能按已知 ID 删除其他租户车辆，平台全部租户仍可按明确记录删除，普通用户伪造租户头也不能越权。`tests/integration/vms-fuel-card-ledger.sql` 用回滚事务覆盖这四种情况。

### 油卡发布与恢复证据（2026-10-26）

- 发布前确认 `vms_fuel_card`、`vms_fuel_card_entry`、油卡按钮及字典对象均不存在；因此新对象的发布前像是“缺失”，原有油卡菜单和角色关联保持不变。完整数据库 Docker 备份当前不可用，按对象范围做事务预演和恢复准备。建表、RLS、函数、按钮、字典在同一事务中预演并 `ROLLBACK`，检查对象仍缺失，然后以同一组语句直接发布。发布后确认两张表、9 个按钮、2 个字典类型存在。
- 回滚事务中的读写验证：期初 100、充值 50、消费 25 得余额 125；超额消费和重复冲正被拒，停用卡拒绝充值；平台全部可读、平台选定其他租户不可读写，普通用户自身可读写且伪造租户头仍留在自身范围，无按钮角色不可读取。事务结束后确认测试卡与流水记录均为 0。持续测试见 `tests/integration/vms-fuel-card-ledger.sql`。
- 恢复前先停用油卡写入口并导出新表的数据和对象定义；若已存在真实业务流水，不得直接删表。仅在确认业务记录仍为零，或已完成独立恢复计划后，可按依赖反序撤销本次新增的 5 个 `vms_*fuel_card*` RPC、两张 `vms_fuel_card*` 表、`create_by='fuel-card-feature'` 的油卡按钮及其角色关联、`fuelCardStatus`/`fuelCardEntryType` 字典条目和类型。旧菜单与旧角色授权不在撤销范围内。
- 首次发布时，QA 租户两台主线测试车辆均为 `pending`，且没有发布的 `vehicle_archive` 审批流程和已认证的 QA 审批用户，因此当时只用隔离浏览器夹具验收，未持久化合成油卡或金额。此记录保留首次发布时的状态；后续真实 QA 数据及验证见下节。

### 卡账与费用联动现状（2026-10-27）

- 电卡使用独立的 `vms_electric_card`、`vms_electric_card_entry` 和私有桶 `vms-electric-card-private`，不与油卡共用余额。期初、充值、充电消费及冲正保留流水，`posting_seq` 固定记账顺序并用于倒序展示及逐笔余额校验。受控读写、直接表 RLS、同租户车辆/人员和私有路径均有边界校验；平台全部/选定/选定其他租户、普通用户自租户及伪造租户头，以及挂失、余额不足、冲正、一车多卡由 `tests/integration/vms-electric-card-scope.sql` 的回滚测试覆盖。QA 租户保留 `VMS-ELEC-QA-20261027-001`、`002` 两张卡，各有期初、充值、消费三笔真实流水，余额分别为 ¥724.80 和 ¥446.00；目前不从 FMS 电费自动生成电卡流水。
- 油卡支付边界已收紧：油卡消费表单只显示所选油卡作为扣款账户，API 只提交 `fuel_card`；`vms_record_fuel_card_transaction_v2` 拒绝 `electric_card` 和 `cash`，未传支付方式的旧消费调用规范为 `fuel_card`，表约束不允许非油卡支付方式进入油卡流水。更新前函数与约束保存在忽略目录 `.artifacts/vms-fuel-payment-guard-prechange.json`；变更经目标库事务预演回滚后发布。`tests/integration/vms-fuel-card-enhancement.sql` 验证电卡和现金请求被拒且余额不变。发布后核对油卡仍为 6 笔流水、合计余额 ¥2,800.00，没有非法消费记录。
- FMS 运单费用选择“燃油费”并使用油卡支付时，按车辆匹配已启用油卡；唯一候选自动带出，多卡时明确选择，油卡号只读。费用保存、修改及作废通过同一费用关联维护油卡消费或冲正，重复提交不会重复扣款；非燃油费及跨车辆卡被拒。两笔持久 QA 费用 `YDFY202610-0019`、`YDFY202610-0020` 分别形成 ¥25.00、¥35.00 油卡消费，关联可从流水跳回费用单。回滚验证见 `tests/integration/fms-waybill-fuel-card-sync.sql` 和 `fms-waybill-fuel-card-evidence-scope.sql`。
- 加油站对账单由 `vms_fuel_statement_batch`、`vms_fuel_statement_row` 独立保存，CSV/XLSX 导入后按油卡流水匹配，文件 SHA 重导返回原批次而不重复写入；金额、升数及站名差异按规则标识，不修改原卡账。QA 批次 `8fe56c68-b138-4148-8ea2-7cf7dc2d3129` 保留两行：¥25.00 对 ¥25.00 匹配，¥42.00 对 ¥35.00 差 ¥7.00 并标红。导入解析与抽屉交互的持续验证分别见 `tests/unit/vms-fuel-statement-import.test.ts`、`tests/e2e/vms-fuel-statement-drawer.spec.ts`；数据库导入、重核对、幂等及租户权限已在目标库事务中验证。
