<template>
  <ArtDrawer
    @open="invalidateBins"
    @close="invalidateBins"
    ref="drawerRef"
    size="88%"
    :show-footer="mode !== 'view'"
  >
    <ArtEmptyState
      v-if="documentError"
      title="单据加载失败"
      :description="documentError"
      size="compact"
    >
      <ElButton type="primary" @click="reloadDocument">重新加载</ElButton>
    </ArtEmptyState>
    <div v-else class="initialization-document-stack min-w-0">
      <ArtEntitySummary
        :icon="isReturn ? 'ri:inbox-unarchive-line' : 'ri:inbox-archive-line'"
        :eyebrow="isInitial ? 'OPENING PURCHASE DOCUMENT' : 'PURCHASE INVENTORY DOCUMENT'"
        :title="form.documentNo || `${mode === 'copy' ? '复制' : '新增'}${title}`"
        description="按单据表头、物料明细、税价和仓储信息依次填写。编号在保存时生成。"
      >
        <template #aside
          ><ElTag
            :type="
              form.status === 'approved'
                ? 'success'
                : form.status === 'submitted'
                  ? 'warning'
                  : 'info'
            "
            >{{ statusLabel }}</ElTag
          ></template
        >
      </ArtEntitySummary>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon>
        {{
          mode === 'view'
            ? '基础资料加载失败，部分名称暂不可用，请重新加载。'
            : '基础资料加载失败，请重试后再保存。'
        }}<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ElAlert v-else type="info" :closable="false" show-icon>
        {{
          isInitial ? '业务日期不得晚于库存组织启用日期。' : ''
        }}物料价格、税额、折扣与辅助数量由系统核算；退货以负数入账。
      </ElAlert>
      <ElAlert v-if="orderTarget" type="success" :closable="false" show-icon>
        承接采购来源 {{ orderTargets.map((target) => target.sourceOrderNo).join('、') }}（下推单
        {{
          orderTarget.documentNo
        }}）。物料数量已按未入库余量预填；可按批次调整本次数量，审核时校验累计入库量。
      </ElAlert>
      <ElAlert v-if="importIntent" type="success" :closable="false" show-icon>
        先选择库存组织及{{
          isEntrustedProcessing ? '客户' : '供应商'
        }}，再在“物料明细”中点击“导入明细”；导入后请核对仓储和价格信息。
      </ElAlert>
      <ArtSectionCard
        title="单据表头"
        :subtitle="
          isOtherInbound
            ? '供应商、业务部门可参选，提交时至少填写一项；记账日期由系统记录。'
            : `${isEntrustedProcessing ? '客户' : '供应商'}、业务日期和库存组织是必填信息；记账日期由系统记录。`
        "
      >
        <ArtDescriptions v-if="mode === 'view'" :data="viewData" :items="viewItems" :columns="3" />
        <ArtForm
          v-else
          ref="formRef"
          :model-value="form"
          @update:model-value="replaceReactiveModel(form, $event)"
          :items="headerItems"
          :rules="headerRules"
          :span="8"
          :gutter="18"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #supplierId>
            <ArtTableSingleSelect
              :model-value="form.supplierId || undefined"
              :selected-data="selectedSupplier"
              :data="suppliers"
              :columns="partyColumns"
              row-key="id"
              label-key="name"
              description-key="code"
              title="选择供应商"
              placeholder="从采购主数据选择"
              :disabled="!form.tenantId || Boolean(orderTarget)"
              @update:model-value="form.supplierId = String($event || '')"
              @update:selected-data="onSupplierSelected"
            />
          </template>
          <template #sourceProjectId>
            <ElSelect
              v-model="headerProjectId"
              filterable
              clearable
              class="w-full!"
              placeholder="选择项目以筛选来源明细"
            >
              <ElOption
                v-for="project in projects"
                :key="project.id"
                :label="project.name"
                :value="project.id"
              />
            </ElSelect>
          </template>
          <template #customerId>
            <ArtTableSingleSelect
              :model-value="form.customerId || undefined"
              :selected-data="selectedHeaderCustomer"
              :data="customers"
              :columns="partyColumns"
              row-key="id"
              label-key="name"
              description-key="code"
              title="选择客户"
              placeholder="从销售主数据选择"
              :disabled="!form.tenantId"
              @update:model-value="form.customerId = String($event || '')"
              @update:selected-data="onCustomerSelected"
            />
          </template>
          <template #purchaserId>
            <ArtEmployeeSelect
              :model-value="form.purchaserId || undefined"
              :selected-data="selectedPurchaser"
              :tenant-id="form.tenantId || undefined"
              title="选择采购员"
              :disabled="!form.tenantId"
              @update:model-value="form.purchaserId = $event || null"
              @update:selected-data="onPurchaserSelected"
            />
          </template>
          <template #keeperId>
            <ArtEmployeeSelect
              :model-value="form.keeperId || undefined"
              :selected-data="selectedKeeper"
              :tenant-id="form.tenantId || undefined"
              title="选择仓管员"
              :disabled="!form.tenantId"
              @update:model-value="form.keeperId = $event || null"
              @update:selected-data="selectedKeeper = $event"
            />
          </template>
        </ArtForm>
      </ArtSectionCard>
      <ArtSectionCard
        :title="kind === 'purchase_return' ? '退货明细' : '物料明细'"
        :subtitle="`共 ${lines.length} 行 · 数量 ${quantityTotal.toFixed(4)} · 价税合计 ${totalAmount.toFixed(2)} 元`"
        :empty="lines.length === 0"
        empty-title="尚未选择物料"
        empty-description="先选择库存组织，再从物料编码中添加明细。"
      >
        <template #actions>
          <div
            v-if="mode !== 'view' && form.tenantId"
            class="flex flex-wrap items-center justify-end gap-2 whitespace-nowrap lg:flex-nowrap"
          >
            <ElDropdown
              v-if="kind === 'purchase_inbound' && (form.supplierId || headerProjectId)"
              trigger="click"
              @command="openSourcePicker"
            >
              <ElButton :loading="selectingSource"
                >选单 <ArtSvgIcon icon="ri:arrow-down-s-line"
              /></ElButton>
              <template #dropdown
                ><ElDropdownMenu>
                  <ElDropdownItem command="purchase_order">采购订单</ElDropdownItem>
                  <ElDropdownItem command="receipt_notice">收料通知单</ElDropdownItem>
                </ElDropdownMenu></template
              >
            </ElDropdown>
            <ArtTableMultipleSelect
              v-if="kind === 'purchase_return' || kind === 'entrusted_processing_return'"
              :api-fn="stockPickerApi"
              :columns="returnStockColumns"
              :disabled-key="stockRowDisabled"
              row-key="id"
              label-key="materialCode"
              description-key="materialDescription"
              title="选择退货库存"
              subtitle="仅显示所选仓库的可用库存；同一物料只能添加一次。"
              @confirm="addStockMaterials"
              ><template #trigger="{ open }"
                ><ElButton type="primary" :disabled="!form.warehouseId" @click="open"
                  ><ArtSvgIcon icon="ri:add-line" />添加物料</ElButton
                ></template
              ></ArtTableMultipleSelect
            >
            <ArtMaterialSelect
              v-else
              v-model:model-values="materialPickerIds"
              v-model:selected-data="materialPickerRows"
              class="w-auto! shrink-0"
              title="选择采购物料"
              subtitle="可按物料编码、名称和描述检索并多选。"
              search-placeholder="搜索物料编码或描述"
              label-key="name"
              multiple
              :categories="materialCategories"
              :api-fn="materialApi"
              @confirm="addMaterials"
            >
              <template #trigger="{ open }"
                ><ElButton type="primary" @click="open"
                  ><ArtSvgIcon icon="ri:add-line" />添加物料</ElButton
                ></template
              >
            </ArtMaterialSelect>
            <span
              v-auth="importPermission"
              class="shrink-0"
              :title="form.organizationId ? '' : '请先选择库存组织'"
            >
              <ArtExcelImport
                accept=".xlsx,.xls,.csv"
                :context-key="openData"
                :disabled="!form.organizationId || importing || parsing"
                :button-props="{ type: 'success', plain: true, loading: importing || parsing }"
                icon="ri:upload-2-line"
                @parsing-change="onImportParsing"
                @import-success="importLines"
                @import-error="onImportError"
                >导入明细</ArtExcelImport
              >
            </span>
          </div>
        </template>
        <ElScrollbar v-if="lines.length">
          <ArtTable
            ref="lineTableRef"
            class="wms-editable-line-table"
            :data="lines"
            :columns="lineColumns"
            :pagination="false"
            :cell-class-name="purchaseLineCellClassName"
            row-key="lineNo"
            table-layout="fixed"
          >
            <template #material="{ row }">
              <strong class="block truncate text-sm">{{
                row.material?.name || row.material?.code || '物料资料不可用'
              }}</strong>
              <small class="text-[var(--el-text-color-secondary)]">{{
                row.material?.code || '—'
              }}</small>
            </template>
            <template #projectId="{ row }">
              <ArtTableSingleSelect
                v-if="mode !== 'view'"
                :model-value="row.projectId || undefined"
                :selected-data="row.project ? [row.project] : []"
                :data="projects"
                :columns="partyColumns"
                row-key="id"
                label-key="name"
                description-key="code"
                title="选择采购项目"
                placeholder="选择项目"
                clearable
                @update:model-value="onInlineProjectChange(row, String($event || '') || null)"
                @update:selected-data="row.project = $event[0] || null"
              />
              <span v-else>{{ projectName(row.projectId) }}</span>
            </template>
            <template #constructionNo="{ row }">
              <ArtTableSingleSelect
                v-if="mode !== 'view' && (isEntrustedProcessing || isOtherInbound)"
                :model-value="row.constructionNo || undefined"
                :api-fn="(params) => constructionPickerApi(row, params)"
                :columns="constructionColumns"
                row-key="constructionNo"
                label-key="constructionNo"
                description-key="sectionName"
                title="选择施工号"
                placeholder="可选，允许为空"
                clearable
                :disabled="!row.projectId"
                @update:model-value="row.constructionNo = String($event || '') || null"
              />
              <ElInput
                v-else-if="mode !== 'view'"
                v-model="row.constructionNo"
                :disabled="!row.projectId"
                placeholder="施工号"
                @change="row.sourceBatchId = null"
              />
              <span v-else>{{ row.constructionNo || '—' }}</span>
            </template>
            <template #quantity="{ row }">
              <ElInputNumber
                v-if="mode !== 'view'"
                :model-value="Math.abs(Number(row.quantity || 0))"
                @update:model-value="row.quantity = Math.abs(Number($event || 0))"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
              />
              <strong v-else :class="isReturn ? 'purchase-return-quantity' : 'tabular-nums'">{{
                displayQuantity(Number(row.quantity)).toFixed(4)
              }}</strong>
            </template>
            <template #inventoryUnitId="{ row }">
              <ElSelect
                v-if="mode !== 'view'"
                v-model="row.inventoryUnitId"
                filterable
                placeholder="库存单位"
                ><ElOption
                  v-for="unit in purchaseUnitOptions"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value"
              /></ElSelect>
              <span v-else>{{ unitName(row.inventoryUnitId) }}</span>
            </template>
            <template #baseUnitId="{ row }">
              <ElSelect
                v-if="mode !== 'view'"
                v-model="row.baseUnitId"
                filterable
                placeholder="基本单位"
              >
                <ElOption
                  v-for="unit in purchaseUnitOptions"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value"
                />
              </ElSelect>
              <span v-else>{{ unitName(row.baseUnitId) }}</span>
            </template>
            <template #baseQuantity="{ row }"
              >{{ kind === 'purchase_return' ? '￥' : ''
              }}{{
                kind === 'purchase_return'
                  ? -Math.abs(mode === 'view' ? Number(row.baseQuantity || 0) : baseQuantity(row))
                  : mode === 'view'
                    ? Math.abs(Number(row.baseQuantity || 0))
                    : baseQuantity(row)
              }}</template
            >
            <template #auxiliaryUnitId="{ row }">{{ unitName(row.auxiliaryUnitId) }}</template>
            <template #auxiliaryQuantity="{ row }">{{
              mode === 'view'
                ? row.auxiliaryQuantity == null
                  ? '—'
                  : Math.abs(Number(row.auxiliaryQuantity))
                : auxQuantity(row, row.auxiliaryUnitId)
            }}</template>
            <template #auxiliaryUnit2Id="{ row }">{{ unitName(row.auxiliaryUnit2Id) }}</template>
            <template #auxiliaryQuantity2="{ row }">{{
              mode === 'view'
                ? row.auxiliaryQuantity2 == null
                  ? '—'
                  : Math.abs(Number(row.auxiliaryQuantity2))
                : auxQuantity(row, row.auxiliaryUnit2Id)
            }}</template>
            <template #unitPrice="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.unitPrice"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
                @change="updatePrice(row, 'untaxed')"
              /><span v-else>{{ Number(row.unitPrice).toFixed(4) }}</span></template
            >
            <template #taxInclusiveUnitPrice="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.taxInclusiveUnitPrice"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
                @change="updatePrice(row, 'taxed')"
              /><span v-else>{{ Number(row.taxInclusiveUnitPrice).toFixed(4) }}</span></template
            >
            <template #taxRate="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.taxRate"
                @change="updatePrice(row, row.priceBasis)"
                ><ElOption
                  v-for="rate in taxRates"
                  :key="rate"
                  :label="`${rate}%`"
                  :value="rate" /></ElSelect
              ><span v-else>{{ row.taxRate }}%</span></template
            >
            <template #discountMethod="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.discountMethod"
                @change="row.unitDiscountRate = 0"
                ><ElOption
                  v-for="option in wmsLineDiscountModeOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{ row.discountMethod }}</span></template
            >
            <template #unitDiscountRate="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.unitDiscountRate"
                :min="0"
                :max="1"
                :precision="4"
                :controls="false"
                :disabled="row.discountMethod === 'none'"
                class="w-full!"
              /><span v-else>{{ row.unitDiscountRate }}</span></template
            >
            <template #discountAmount="{ row }">{{
              lineFinancial(row).discount.toFixed(2)
            }}</template>
            <template #amount="{ row }"
              >{{ kind === 'purchase_return' ? '￥' : ''
              }}{{ lineFinancial(row).amount.toFixed(2) }}</template
            >
            <template #taxAmount="{ row }"
              >{{ kind === 'purchase_return' ? '￥' : ''
              }}{{ lineFinancial(row).tax.toFixed(2) }}</template
            >
            <template #totalAmount="{ row }"
              >{{ kind === 'purchase_return' ? '￥' : ''
              }}{{ lineFinancial(row).total.toFixed(2) }}</template
            >
            <template #gift="{ row }"
              ><ElCheckbox v-if="mode !== 'view'" v-model="row.gift" aria-label="赠品" /><span
                v-else
                >{{ row.gift ? '✓' : '—' }}</span
              ></template
            >
            <template #batchNo="{ row }"
              ><ElInput
                v-if="mode !== 'view'"
                v-model="row.batchNo"
                :disabled="!isInitial && !isReturn && row.material?.batchManagementEnabled"
                :placeholder="
                  !isInitial && !isReturn && row.material?.batchManagementEnabled
                    ? '入库时自动生成'
                    : '可留空或手工填写'
                "
                @change="row.sourceBatchId = null"
              /><span v-else>{{ row.batchNo || '—' }}</span></template
            >
            <template #warehouseId="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.warehouseId"
                filterable
                clearable
                placeholder="仓库"
                @change="onInlineWarehouseChange(row)"
                ><ElOption
                  v-for="warehouse in currentWarehouses"
                  :key="warehouse.id"
                  :label="`${warehouse.warehouseName} · ${warehouse.warehouseCode}`"
                  :value="warehouse.id" /></ElSelect
              ><span v-else>{{
                currentWarehouses.find((item) => item.id === row.warehouseId)?.warehouseName || '—'
              }}</span></template
            >
            <template #binId="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.binId"
                filterable
                clearable
                :disabled="!row.warehouseId"
                placeholder="仓位"
                @visible-change="($event) => $event && loadInlineBins(row)"
                @change="row.sourceBatchId = null"
                ><ElOption
                  v-if="missingSelectedBin(row)"
                  :label="`${row.bin?.binName} · ${row.bin?.binCode}`"
                  :value="row.binId" /><ElOption
                  v-for="bin in bins"
                  :key="bin.id"
                  :label="`${bin.binName} · ${bin.binCode}`"
                  :value="bin.id" /></ElSelect
              ><span v-else>{{
                row.bin?.binName || row.bin?.binCode || (row.binId ? '仓位资料不可用' : '—')
              }}</span></template
            >
            <template #stockType="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.stockType"
                @change="row.sourceBatchId = null"
                ><ElOption
                  v-for="option in stockTypes"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{
                stockTypes.find((item) => item.value === row.stockType)?.label || row.stockType
              }}</span></template
            >
            <template #ownerType="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.ownerType"
                @change="onInlineOwnerTypeChange(row)"
                ><ElOption
                  v-for="option in ownerTypes"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{
                ownerTypes.find((item) => item.value === row.ownerType)?.label || row.ownerType
              }}</span></template
            >
            <template #ownerId="{ row }"
              ><ArtTableSingleSelect
                v-if="mode !== 'view' && row.ownerType !== 'self'"
                :model-value="row.ownerId || undefined"
                :data="row.ownerType === 'supplier' ? suppliers : customers"
                :columns="partyColumns"
                row-key="id"
                label-key="name"
                description-key="code"
                title="选择货主"
                @update:model-value="onInlineOwnerChange(row, String($event || '') || null)"
              /><span v-else>{{
                formatWmsOwnerName(row.ownerType, row.ownerId, suppliers, customers)
              }}</span></template
            >
            <template #stockStatus="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.stockStatus"
                @change="row.sourceBatchId = null"
                ><ElOption
                  v-for="option in stockStatuses"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{
                stockStatuses.find((item) => item.value === row.stockStatus)?.label ||
                row.stockStatus
              }}</span></template
            >
            <template #sourceBatchId="{ row }"
              ><ArtTableSingleSelect
                v-if="mode !== 'view'"
                :model-value="row.sourceBatchId || undefined"
                :api-fn="(params) => sourceBatchApi(row, params)"
                :columns="sourceBatchColumns"
                :disabled="!row.warehouseId || !row.materialId"
                row-key="id"
                label-key="batchNo"
                title="选择退料来源批次"
                @update:model-value="row.sourceBatchId = String($event || '') || null"
                @update:selected-data="onInlineSourceBatchSelected(row, $event)"
              /><span v-else>{{ row.batchNo || '—' }}</span></template
            >
            <template #productionDate="{ row }"
              ><ElDatePicker
                v-if="mode !== 'view'"
                v-model="row.productionDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="生产日期"
                class="w-full!"
              /><span v-else>{{ row.productionDate || '—' }}</span></template
            >
            <template #expiryDate="{ row }"
              ><ElDatePicker
                v-if="mode !== 'view'"
                v-model="row.expiryDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="有效期至"
                class="w-full!"
              /><span v-else>{{ row.expiryDate || '—' }}</span></template
            >
            <template #trackingNo="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.trackingNo" placeholder="跟踪号" /><span
                v-else
                >{{ row.trackingNo || '—' }}</span
              ></template
            >
            <template #sourceDocument="{ row }"
              ><ElInput
                v-if="mode !== 'view'"
                v-model="row.sourceDocument"
                placeholder="来源单据"
              /><span v-else>{{ row.sourceDocument || '—' }}</span></template
            >
            <template #sourceLineNo="{ row }"
              ><ElInput
                v-if="mode !== 'view'"
                v-model="row.sourceLineNo"
                placeholder="源行号"
              /><span v-else>{{ row.sourceLineNo || '—' }}</span></template
            >
            <template #remark="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.remark" placeholder="备注" /><span
                v-else
                >{{ row.remark || '—' }}</span
              ></template
            >
            <template #operation="{ row }">
              <ElButton
                v-if="row.material?.serialManagementEnabled"
                link
                type="primary"
                @click="openInlineSerials(row)"
                >序列号 {{ row.serialNos.length }}</ElButton
              >
              <ArtButtonMore
                v-if="mode !== 'view'"
                :list="lineMoreActions"
                trigger="click"
                @click="(item) => onLineMoreAction(item, row)"
              />
            </template>
            <template #purchaserId="{ row }">
              <ArtEmployeeSelect
                v-if="mode !== 'view'"
                :model-value="row.purchaserId || undefined"
                :selected-data="row.purchaser ? [row.purchaser] : []"
                :tenant-id="form.tenantId || undefined"
                title="选择行采购员"
                @update:model-value="row.purchaserId = $event || null"
                @update:selected-data="row.purchaser = $event[0] || null"
              />
              <span v-else>{{ row.purchaser?.employeeName || '—' }}</span>
            </template>
            <template #keeperId="{ row }">
              <ArtEmployeeSelect
                v-if="mode !== 'view'"
                :model-value="row.keeperId || undefined"
                :selected-data="row.keeper ? [row.keeper] : []"
                :tenant-id="form.tenantId || undefined"
                title="选择行仓管员"
                @update:model-value="row.keeperId = $event || null"
                @update:selected-data="row.keeper = $event[0] || null"
              />
              <span v-else>{{ row.keeper?.employeeName || '—' }}</span>
            </template>
          </ArtTable>
        </ElScrollbar>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
  <ArtTableMultipleSelect
    :show-trigger="false"
    ref="sourcePickerRef"
    :api-fn="sourcePickerApi"
    :columns="inboundSourceColumns"
    :disabled-key="sourceRowDisabled"
    row-key="id"
    label-key="documentNo"
    description-key="materialDescription"
    :title="sourcePickerKind === 'purchase_order' ? '选择采购订单明细' : '选择收料通知单明细'"
    subtitle="按表头供应商、项目筛选未全部入库的明细，支持多选和分批入库。"
    @confirm="addSourceLines"
  ></ArtTableMultipleSelect>

  <ArtDialog ref="serialEntryDialogRef" size="sm" :show-footer="mode !== 'view'">
    <ArtExcelImport
      accept=".txt,.csv"
      :parse-excel="false"
      :button-props="{ link: true, type: 'primary' }"
      @file-change="importSerials"
      >导入序列号</ArtExcelImport
    >
    <ArtForm
      :model-value="serialEntryForm"
      @update:model-value="replaceReactiveModel(serialEntryForm, $event)"
      :items="serialEntryItems"
      :show-reset="false"
      :show-submit="false"
      label-position="top"
    />
  </ArtDialog>
  <ArtDialog ref="serialViewDialogRef" size="sm" :show-footer="false">
    <ArtEmptyState
      v-if="!serialList.length"
      size="compact"
      title="暂无序列号"
      description="录入或导入序列号后可在这里查看。"
    />
    <ElScrollbar
      v-else
      max-height="24rem"
      class="rounded-xl bg-[var(--el-fill-color-light)] font-mono text-sm whitespace-pre-wrap"
      ><div class="p-4">{{ serialList.join('\n') }}</div></ElScrollbar
    >
  </ArtDialog>
</template>

<script setup lang="ts">
  import { getMaterialCategoryIds } from '@/utils/business/material-category'
  import { readWmsDocumentImportRows } from '@/utils/wms/document-import'
  import { createImportReferenceLookup } from '@/utils/business/import-reference'
  import { formatWmsOwnerName } from '@/utils/wms/owner-display'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { isWmsBusinessTypeAvailable } from '@/utils/wms/business-type'
  import { useWarehouseBinOptions } from '@/hooks/core/useWarehouseBinOptions'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { parseSerialNumberText } from '@/utils/file/serial-number-text'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import dayjs from 'dayjs'
  import { cloneDeep, uniq } from 'lodash-es'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase/error'
  import { ElMessage } from 'element-plus'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { useUserStore } from '@/store/modules/user'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { fetchEnabledOrganizationTree } from '@/api/system-manage'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtMaterialSelect from '@/components/business/art-material-select/index.vue'
  import type {
    MaterialSelectCategory,
    MaterialSelectRecord
  } from '@/components/business/art-material-select/types'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import { inboundSourceColumns, returnStockColumns } from './purchase-selection-columns'
  import {
    fetchWmsInboundSources,
    prepareWmsInboundSources,
    fetchWmsReturnStock,
    fetchWmsConstructionOptions,
    type WmsInboundSourceRow,
    type WmsReturnStockRow
  } from '@/api/wms-purchase-selection'
  import { fetchWmsMaterialCategories } from '@/api/wms-material-category'
  import type {
    DataSelectColumn,
    DataSelectRecord,
    DataSelectFetchParams
  } from '@/components/core/forms/art-data-select/types'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import type { ColumnOption } from '@/types'
  import {
    fetchWmsPurchaseBins,
    fetchWmsPurchaseDocumentTypes,
    fetchWmsPurchaseMenuId,
    fetchWmsPurchaseMaterials,
    fetchWmsPurchaseOptions,
    fetchWmsPurchaseSourceBatches,
    fetchWmsPurchaseDocument,
    fetchWmsPurchaseOrderTarget,
    fetchWmsPurchaseUnits,
    fetchWmsPurchaseWarehouses,
    saveWmsPurchaseDocument,
    type WmsPurchaseBin,
    type WmsPurchaseMaterial,
    type WmsPurchaseDocument,
    type WmsPurchaseKind,
    type WmsPurchaseLine,
    type WmsPurchaseOption,
    type WmsPurchaseOrderTarget,
    type WmsPurchaseUnit,
    type WmsPurchaseWarehouse
  } from '@/api/wms-purchase'
  import {
    fetchWmsInventoryOrganizationOptions,
    type WmsInventoryOrganizationOption
  } from '@/api/wms-inventory-organization'

  const wmsLineDiscountModeOptions = useDictionaryOptions('wmsLineDiscountMode')

  type OpenMode = 'create' | 'copy' | 'edit' | 'view'
  interface OpenData {
    mode: OpenMode
    document?: WmsPurchaseDocument
    documentId?: string
    sourceLineIds?: string[]
    importIntent?: boolean
    orderTargetId?: string
    orderTargets?: Array<{ targetId: string; sourceLineIds: string[] }>
  }
  const props = defineProps<{
    kind: WmsPurchaseKind
    permissionPrefix: string
    importPermission: string
  }>()
  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const serialEntryDialogRef = ref<ArtDialogExpose>()
  const serialViewDialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const lineTableRef = ref<InstanceType<typeof ArtTable>>()
  const mode = ref<OpenMode>('create')
  const importIntent = ref(false)
  const currentDocument = shallowRef<WmsPurchaseDocument | null>(null)
  const orderTarget = shallowRef<WmsPurchaseOrderTarget | null>(null)
  const orderTargets = shallowRef<WmsPurchaseOrderTarget[]>([])
  const optionError = ref(false)
  const documentError = ref('')
  const openData = shallowRef<OpenData>()
  let documentRequest = 0
  const importing = ref(false)
  const parsing = ref(false)
  const organizations = ref<WmsInventoryOrganizationOption[]>([])
  const warehouses = ref<WmsPurchaseWarehouse[]>([])
  const units = ref<WmsPurchaseUnit[]>([])
  const documentTypes = ref<WmsPurchaseOption[]>([])
  const businessTypes = ref<WmsPurchaseOption[]>([])
  const businessMenuId = ref('')
  const customers = ref<WmsPurchaseOption[]>([])
  const suppliers = ref<WmsPurchaseOption[]>([])
  const projects = ref<WmsPurchaseOption[]>([])
  const businessDepartments = ref<WmsPurchaseOption[]>([])
  const isOtherInbound = computed(() => ['other_inbound', 'other_return'].includes(props.kind))
  const {
    options: bins,
    load: loadInlineBins,
    invalidate: invalidateBins
  } = useWarehouseBinOptions<WmsPurchaseLine, WmsPurchaseBin>(
    () => lines.value,
    fetchWmsPurchaseBins
  )
  const lines = ref<WmsPurchaseLine[]>([])
  const permissionPrefix = computed(() => props.permissionPrefix)
  const lineEditPermission = computed(
    () =>
      `${permissionPrefix.value}:${mode.value === 'create' ? 'Add' : mode.value === 'copy' ? 'Copy' : 'Edit'}`
  )
  const lineMoreActions = computed<ButtonMoreItem[]>(() => [
    {
      key: 'copy-line',
      label: '复制明细',
      icon: 'ri:file-copy-line',
      auth: lineEditPermission.value
    },
    {
      key: 'delete-line',
      label: '删除明细',
      icon: 'ri:delete-bin-line',
      color: 'var(--el-color-danger)',
      auth: lineEditPermission.value
    }
  ])
  const lineColumns = computed<ColumnOption<WmsPurchaseLine>[]>(() => [
    { prop: 'lineNo', label: '行号', width: 68 },
    { prop: 'material', label: '物料', minWidth: 230, useSlot: true },
    { prop: 'projectId', label: '项目名称', minWidth: 150, useSlot: true },
    { prop: 'constructionNo', label: '施工号', width: 150, useSlot: true },
    { prop: 'quantity', label: '数量', width: 180, align: 'right', useSlot: true },
    {
      prop: 'inventoryUnitId',
      label: '库存单位',
      width: 110,
      useSlot: true,
      required: mode.value !== 'view'
    },
    { prop: 'baseUnitId', label: '基本单位', width: 130, useSlot: true },
    { prop: 'baseQuantity', label: '基本数量', width: 110, align: 'right', useSlot: true },
    { prop: 'auxiliaryUnitId', label: '辅助单位', width: 110, useSlot: true },
    { prop: 'auxiliaryQuantity', label: '辅助数量', width: 110, useSlot: true },
    { prop: 'auxiliaryUnit2Id', label: '辅助单位2', width: 110, useSlot: true },
    { prop: 'auxiliaryQuantity2', label: '辅助数量2', width: 110, useSlot: true },
    ...(isEntrustedProcessing.value
      ? [
          {
            prop: 'receivedQuantity',
            label: '已收料',
            width: 100,
            align: 'right' as const,
            formatter: (row: WmsPurchaseLine) => processingQuantities(row).received.toFixed(4)
          },
          {
            prop: 'unreceivedQuantity',
            label: '未收料',
            width: 100,
            align: 'right' as const,
            formatter: (row: WmsPurchaseLine) => processingQuantities(row).unreceived.toFixed(4)
          },
          {
            prop: 'returnedQuantity',
            label: '已退库',
            width: 100,
            align: 'right' as const,
            formatter: (row: WmsPurchaseLine) => processingQuantities(row).returned.toFixed(4)
          },
          {
            prop: 'unreturnedQuantity',
            label: '未退库',
            width: 100,
            align: 'right' as const,
            formatter: (row: WmsPurchaseLine) => processingQuantities(row).unreturned.toFixed(4)
          }
        ]
      : []),
    { prop: 'unitPrice', label: '未税单价', width: 180, align: 'right', useSlot: true },
    { prop: 'taxInclusiveUnitPrice', label: '含税单价', width: 180, align: 'right', useSlot: true },
    { prop: 'taxRate', label: '税率', width: 100, align: 'right', useSlot: true },
    { prop: 'discountMethod', label: '折扣方式', width: 130, useSlot: true },
    { prop: 'unitDiscountRate', label: '单位折扣', width: 120, useSlot: true },
    { prop: 'discountAmount', label: '折扣额', width: 110, align: 'right', useSlot: true },
    { prop: 'amount', label: '金额', width: 110, align: 'right', useSlot: true },
    ...(props.kind === 'purchase_return'
      ? [
          {
            prop: 'taxAmount',
            label: '税额(元)',
            width: 110,
            align: 'right' as const,
            useSlot: true
          }
        ]
      : []),
    { prop: 'totalAmount', label: '价税合计', width: 124, align: 'right', useSlot: true },
    { prop: 'gift', label: '赠品', width: 68, align: 'center', useSlot: true },
    { prop: 'batchNo', label: '批号', width: 145, useSlot: true },
    {
      prop: 'warehouseId',
      label: '仓库',
      width: 180,
      useSlot: true,
      required: mode.value !== 'view'
    },
    { prop: 'binId', label: '仓位', width: 155, useSlot: true },
    {
      prop: 'stockType',
      label: '库存类型',
      width: 160,
      useSlot: true,
      required: mode.value !== 'view'
    },
    { prop: 'ownerType', label: '货主类型', width: 160, useSlot: true },
    { prop: 'ownerId', label: '货主', width: 170, useSlot: true },
    { prop: 'stockStatus', label: '库存状态', width: 160, useSlot: true },
    ...(props.kind === 'initial_inbound'
      ? [{ prop: 'purchaserId', label: '采购员', width: 170, useSlot: true }]
      : []),
    { prop: 'keeperId', label: '仓管员', width: 170, useSlot: true },
    ...(isReturn.value
      ? [{ prop: 'sourceBatchId', label: '退料来源批次', width: 180, useSlot: true }]
      : []),
    { prop: 'productionDate', label: '生产日期', width: 190, useSlot: true },
    { prop: 'expiryDate', label: '有效期至', width: 190, useSlot: true },
    { prop: 'trackingNo', label: '跟踪号', width: 150, useSlot: true },
    { prop: 'sourceDocument', label: '来源单据', width: 150, useSlot: true },
    { prop: 'sourceLineNo', label: '源行号', width: 120, useSlot: true },
    { prop: 'remark', label: '备注', width: 180, useSlot: true },
    {
      prop: 'operation',
      label: '操作',
      width: 135,
      fixed: 'right',
      useSlot: true
    }
  ])
  const materialPickerIds = ref<string[]>([])
  const materialPickerRows = ref<MaterialSelectRecord[]>([])
  const materialCategories = ref<MaterialSelectCategory[]>([])
  const selectedSupplier = ref<DataSelectRecord[]>([])
  const selectedHeaderCustomer = ref<DataSelectRecord[]>([])
  const selectedPurchaser = ref<EmployeeIntegrationItem[]>([])
  const selectedKeeper = ref<EmployeeIntegrationItem[]>([])
  const serialLine = ref<WmsPurchaseLine>()
  const serialText = ref('')
  const serialEntryForm = reactive({ serialText: '' })
  const serialEntryItems: FormItem[] = [
    {
      key: 'serialText',
      label: '序列号',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 10,
        maxlength: undefined,
        showWordLimit: false,
        placeholder: '每行一个序列号；导入后核对，再保存到当前明细'
      }
    }
  ]
  const form = reactive({
    id: '',
    tenantId: '',
    organizationId: '',
    documentNo: '',
    documentTypeId: '',
    businessTypeId: '',
    businessDate: '',
    accountingDate: dayjs().format('YYYY-MM-DD'),
    supplierId: '',
    supplierCode: '',
    customerId: '',
    customerCode: '',
    purchaserId: null as string | null,
    purchaseDepartmentId: null as string | null,
    businessDepartmentId: null as string | null,
    keeperId: null as string | null,
    warehouseId: null as string | null,
    status: 'draft' as WmsPurchaseDocument['status'],
    isInitialization: true,
    remark: ''
  })
  const headerProjectId = ref<string | null>(null)
  const selectingSource = ref(false)
  const sourcePickerRef =
    ref<import('@/components/core/forms/art-data-select/types').ArtDataSelectExpose>()
  const sourcePickerKind = ref<'purchase_order' | 'receipt_notice'>('purchase_order')
  async function openSourcePicker(kind: 'purchase_order' | 'receipt_notice'): Promise<void> {
    if (selectingSource.value) return
    sourcePickerKind.value = kind
    await sourcePickerRef.value?.open()
  }
  function sourcePickerApi(params: DataSelectFetchParams) {
    return fetchWmsInboundSources({
      ...params,
      kind: sourcePickerKind.value,
      tenantId: form.tenantId,
      supplierId: form.supplierId || null,
      projectId: headerProjectId.value
    })
  }
  function sourceRowDisabled(row: WmsInboundSourceRow): boolean {
    return lines.value.some(
      (line) => line.sourceDocument === row.documentNo && line.sourceLineNo === String(row.lineNo)
    )
  }
  function targetLineToLine(
    target: WmsPurchaseOrderTarget,
    sourceLine: WmsPurchaseOrderTarget['lines'][number]
  ): WmsPurchaseLine {
    const unit = units.value.find(
      (item) => item.unitCode === sourceLine.unitCode || item.unitName === sourceLine.unitCode
    )
    if (!unit) throw new Error(`采购单据第 ${sourceLine.lineNo} 行单位未配置到 WMS`)
    const line = makeLine(sourceLine.material)
    Object.assign(line, {
      projectId: target.projectId,
      constructionNo: target.constructionNo,
      warehouseId: sourceLine.warehouseId || form.warehouseId,
      binId: sourceLine.binId,
      batchNo: sourceLine.batchNo,
      serialNos: sourceLine.serialNos,
      purchaserId: target.purchaserId,
      keeperId: target.keeperId,
      gift: sourceLine.gift,
      inventoryUnitId: unit.id,
      quantity: sourceLine.quantity,
      unitPrice: sourceLine.unitPrice,
      taxRate: sourceLine.taxRate,
      taxInclusiveUnitPrice: round(sourceLine.unitPrice * (1 + sourceLine.taxRate / 100)),
      discountMethod: sourceLine.discountRate > 0 ? 'rate' : 'none',
      unitDiscountRate: sourceLine.discountRate / 100,
      stockType: sourceLine.gift ? 'gift' : 'normal',
      ownerType: sourceLine.ownerType,
      ownerId: sourceLine.ownerId,
      sourceDocument: target.sourceOrderNo,
      sourceLineNo: String(sourceLine.lineNo),
      sourceOrderTargetLineId: sourceLine.id
    })
    return line
  }
  async function addSourceLines(_ids: unknown, rows: WmsInboundSourceRow[]): Promise<void> {
    if (!rows.length || selectingSource.value) return
    selectingSource.value = true
    const request = documentRequest
    const context = `${form.tenantId}:${form.supplierId}:${headerProjectId.value}`
    try {
      const selections = await prepareWmsInboundSources(rows)
      if (request !== documentRequest) return
      const targets = await Promise.all(
        selections.map(async (selection) => {
          const target = await fetchWmsPurchaseOrderTarget(selection.targetId)
          return {
            ...target,
            lines: target.lines.filter((line) =>
              selection.sourceLineIds.includes(line.sourceLineId)
            )
          }
        })
      )
      if (request !== documentRequest) return
      if (context !== `${form.tenantId}:${form.supplierId}:${headerProjectId.value}`)
        throw new Error('表头已变化，请重新选单')
      if (
        targets.some(
          (target) =>
            target.tenantId !== form.tenantId ||
            (form.supplierId && target.supplierId !== form.supplierId)
        )
      )
        throw new Error('所选明细与当前供应商不一致，请重新选单')
      const additions = targets.flatMap((target) =>
        target.lines.map((line) => targetLineToLine(target, line))
      )
      if (
        additions.some((line) =>
          lines.value.some(
            (existing) => existing.sourceOrderTargetLineId === line.sourceOrderTargetLineId
          )
        )
      )
        throw new Error('所选来源明细已添加，请重新选择')
      form.supplierId = targets[0].supplierId
      form.supplierCode = suppliers.value.find((item) => item.id === form.supplierId)?.code || ''
      selectedSupplier.value = suppliers.value.filter((item) => item.id === form.supplierId)
      lines.value.push(...additions)
      orderTargets.value.push(...targets)
      renumber()
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '选单带入失败，请刷新重试'))
    } finally {
      selectingSource.value = false
    }
  }
  function stockPickerApi(params: DataSelectFetchParams) {
    if (!form.warehouseId) throw new Error('请先选择退货仓库')
    return fetchWmsReturnStock({
      ...params,
      kind:
        props.kind === 'entrusted_processing_return'
          ? 'entrusted_processing_return'
          : 'purchase_return',
      tenantId: form.tenantId,
      organizationId: form.organizationId,
      warehouseId: form.warehouseId
    })
  }
  const constructionColumns: DataSelectColumn<
    import('@/api/wms-purchase-selection').WmsConstructionOption
  >[] = [
    { prop: 'constructionNo', label: '施工号', minWidth: 160 },
    { prop: 'sectionName', label: '名称', minWidth: 200 }
  ]
  async function constructionPickerApi(line: WmsPurchaseLine, params: DataSelectFetchParams) {
    if (!line.projectId) return { data: [], total: 0 }
    const data = await fetchWmsConstructionOptions(line.projectId, form.tenantId, params.keyword)
    return { data, total: data.length }
  }
  function missingSelectedBin(line: WmsPurchaseLine): boolean {
    return Boolean(line.binId && line.bin && !bins.value.some((bin) => bin.id === line.binId))
  }
  function stockRowDisabled(row: WmsReturnStockRow): boolean {
    return (
      row.availableQuantity <= 0 || lines.value.some((line) => line.materialId === row.materialId)
    )
  }
  function addStockMaterials(_ids: unknown, rows: WmsReturnStockRow[]): void {
    const materialIds = rows.map((row) => row.materialId)
    if (uniq(materialIds).length !== materialIds.length || rows.some(stockRowDisabled)) {
      ElMessage.warning('同一退货单不能重复添加物料，请重新选择')
      return
    }
    if (
      rows.some(
        (row) => row.warehouseId !== form.warehouseId || row.material.tenantId !== form.tenantId
      )
    ) {
      ElMessage.warning('仓库已变化，请重新选择库存')
      return
    }
    lines.value.push(
      ...rows.map((row) => {
        const line = makeLine(row.material)
        Object.assign(line, {
          projectId: row.projectId,
          constructionNo: row.constructionNo,
          warehouseId: row.warehouseId,
          binId: row.binId,
          quantity: row.availableQuantity,
          inventoryUnitId: row.inventoryUnitId,
          sourceBatchId: row.id,
          unitPrice: row.unitPrice,
          taxInclusiveUnitPrice: row.unitPrice,
          batchNo: row.batchNo,
          serialNos: row.serialNos,
          keeperId: row.keeperId,
          ownerType: row.ownerType,
          ownerId: row.ownerId,
          stockType: row.stockType,
          stockStatus: row.stockStatus
        })
        return line
      })
    )
    renumber()
  }
  void userStore.ensureDictLoaded('wmsInitialStockType')
  void userStore.ensureDictLoaded('wmsInitialStockCondition')
  void userStore.ensureDictLoaded('mdmBusinessOwnerType')
  const stockTypes = computed(() => userStore.getDictMap['wmsInitialStockType'] ?? [])
  const stockStatuses = computed(() => userStore.getDictMap['wmsInitialStockCondition'] ?? [])
  const ownerTypes = computed(() => userStore.getDictMap['mdmBusinessOwnerType'] ?? [])
  const taxRates = [0, 1, 3, 6, 9, 13]
  const isReturn = computed(() =>
    ['initial_return', 'purchase_return', 'other_return', 'entrusted_processing_return'].includes(
      props.kind
    )
  )
  const isInitial = computed(() => props.kind.startsWith('initial_'))
  const isOpeningReturn = computed(() => props.kind === 'initial_return')
  const isEntrustedProcessing = computed(() => props.kind.startsWith('entrusted_processing_'))
  const title = computed(
    () =>
      ({
        initial_inbound: '期初采购入库单',
        initial_return: '期初采购退料单',
        purchase_inbound: '采购入库单',
        purchase_return: '采购退货单',
        other_inbound: '其他入库单',
        other_return: '其他入库退回单',
        entrusted_processing_inbound: '受托加工材料入库单',
        entrusted_processing_return: '受托加工材料退料单'
      })[props.kind]
  )
  const statusLabel = computed(
    () => ({ draft: '暂存', submitted: '已提交', approved: '已审核' })[form.status]
  )
  const documentTypeMenuName = computed(
    () =>
      ({
        initial_inbound: 'WmsInitialPurchaseInbound',
        initial_return: 'WmsInitialPurchaseReturn',
        purchase_inbound: 'WmsPurchaseInbound',
        purchase_return: 'WmsPurchaseReturn',
        other_inbound: 'WmsOtherInbound',
        other_return: 'WmsOtherInbound',
        entrusted_processing_inbound: 'WmsEntrustedProcessingInbound',
        entrusted_processing_return: 'WmsEntrustedProcessingReturn'
      })[props.kind]
  )
  const selectedOrganization = computed(() =>
    organizations.value.find((item) => item.id === form.organizationId)
  )
  const viewData = computed(() => ({
    documentNo: form.documentNo,
    organization:
      currentDocument.value?.organization?.organizationName ||
      selectedOrganization.value?.organizationName ||
      '—',
    organizationCode:
      currentDocument.value?.organization?.organizationCode ||
      selectedOrganization.value?.organizationCode ||
      '—',
    documentType:
      documentTypes.value.find((item) => item.id === form.documentTypeId)?.name || title.value,
    businessType: businessTypes.value.find((item) => item.id === form.businessTypeId)?.name || '—',
    businessDate: form.businessDate,
    accountingDate: form.accountingDate,
    supplier:
      currentDocument.value?.supplier?.supplierName ||
      suppliers.value.find((item) => item.id === form.supplierId)?.name ||
      '—',
    supplierCode: suppliers.value.find((item) => item.id === form.supplierId)?.code || '—',
    customer:
      currentDocument.value?.customer?.customerName ||
      customers.value.find((item) => item.id === form.customerId)?.name ||
      '—',
    customerCode: customers.value.find((item) => item.id === form.customerId)?.code || '—',
    purchaseDepartment:
      organizations.value.find((item) => item.id === form.purchaseDepartmentId)?.organizationName ||
      '—',
    businessDepartment:
      businessDepartments.value.find((item) => item.id === form.businessDepartmentId)?.name || '—',
    purchaser:
      currentDocument.value?.purchaser?.employeeName || (form.purchaserId ? '已指定' : '未指定'),
    keeper: currentDocument.value?.keeper?.employeeName || (form.keeperId ? '已指定' : '未指定'),
    warehouse: warehouses.value.find((item) => item.id === form.warehouseId)?.warehouseName || '—',
    initialization: form.isInitialization ? '是' : '否',
    remark: form.remark || '—'
  }))
  const viewItems: ArtDescriptionItem<typeof viewData.value>[] = [
    { key: 'documentNo', label: '单据编号', field: 'documentNo', copyable: true },
    { key: 'organization', label: '库存组织', field: 'organization' },
    { key: 'organizationCode', label: '组织编码', field: 'organizationCode' },
    { key: 'documentType', label: '单据类型', field: 'documentType' },
    { key: 'businessType', label: '业务类型', field: 'businessType' },
    ...(isOtherInbound.value
      ? [{ key: 'businessDepartment', label: '业务部门', field: 'businessDepartment' as const }]
      : []),
    { key: 'businessDate', label: '业务日期', field: 'businessDate' },
    { key: 'accountingDate', label: '记账日期', field: 'accountingDate' },
    ...(isEntrustedProcessing.value
      ? [
          { key: 'customer', label: '客户全称', field: 'customer' as const },
          { key: 'customerCode', label: '客户编码', field: 'customerCode' as const }
        ]
      : [
          { key: 'supplier', label: '供应商', field: 'supplier' as const },
          { key: 'supplierCode', label: '供应商编码', field: 'supplierCode' as const },
          {
            key: 'purchaseDepartment',
            label: '采购部门',
            field: 'purchaseDepartment' as const
          },
          { key: 'purchaser', label: '采购员', field: 'purchaser' as const }
        ]),
    { key: 'keeper', label: '仓管员', field: 'keeper' },
    { key: 'warehouse', label: '仓库', field: 'warehouse' },
    { key: 'initialization', label: '初始化单据', field: 'initialization' },
    { key: 'remark', label: '备注', field: 'remark', span: 3 }
  ]
  const currentWarehouses = computed(() =>
    warehouses.value.filter(
      (item) =>
        item.tenantId === form.tenantId &&
        item.organizationId === form.organizationId &&
        item.status === 'enabled'
    )
  )
  const availableOrganizations = computed(() =>
    organizations.value.filter(
      (item) =>
        item.enabledOn &&
        (!isInitial.value || !item.initializationClosedAt) &&
        (!orderTarget.value || item.tenantId === orderTarget.value.tenantId)
    )
  )
  const quantityTotal = computed(() =>
    lines.value.reduce((sum, item) => sum + displayQuantity(item.quantity), 0)
  )
  const totalAmount = computed(() =>
    lines.value.reduce((sum, item) => sum + lineFinancial(item).total, 0)
  )
  function purchaseLineCellClassName({ column }: { column: { property?: string } }): string {
    if (
      (isOpeningReturn.value || props.kind === 'purchase_return') &&
      [
        'quantity',
        'baseQuantity',
        'auxiliaryQuantity',
        'auxiliaryQuantity2',
        'discountAmount',
        'amount',
        'taxAmount',
        'totalAmount'
      ].includes(column.property || '')
    )
      return 'opening-return-value-cell'
    return isReturn.value && column.property === 'quantity' ? 'purchase-return-quantity-cell' : ''
  }
  const purchaseUnitOptions = computed(() =>
    units.value.map((item) => ({
      label: `${formatUnitDisplayName(item.unitName)}`,
      value: item.id
    }))
  )
  const headerItems = computed<FormItem[]>(() => [
    ...(props.kind === 'purchase_inbound'
      ? [
          {
            key: 'sourceProjectId',
            label: '项目名称',
            type: 'select' as const,
            options: projects.value.map((item) => ({ label: item.name, value: item.id })),
            props: {
              modelValue: headerProjectId.value,
              'onUpdate:modelValue': (value: string | null) => {
                headerProjectId.value = value
              },
              clearable: true,
              filterable: true,
              disabled: mode.value === 'view'
            }
          }
        ]
      : []),
    {
      key: 'documentNo',
      label: '单据编号',
      type: 'input',
      props: { readonly: true, placeholder: '保存时按月度编号规则生成' }
    },
    {
      key: 'organizationId',
      label: '库存组织',
      type: 'select',
      options: availableOrganizations.value.map((item) => ({
        label: `${item.organizationName} · ${item.organizationCode}`,
        value: item.id
      })),
      props: { filterable: true, disabled: mode.value === 'view', onChange: onOrganizationChange }
    },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      options: documentTypes.value.map((item) => ({ label: item.name, value: item.id })),
      props: { disabled: mode.value === 'view', onChange: onDocumentTypeChange }
    },
    {
      key: 'businessTypeId',
      label: '业务类型',
      type: 'select',
      options: businessTypes.value
        .filter((item) =>
          isWmsBusinessTypeAvailable(item, form.documentTypeId, businessMenuId.value)
        )
        .map((item) => ({ label: item.name, value: item.id })),
      props: { disabled: mode.value === 'view' }
    },
    {
      key: 'businessDate',
      label: '业务日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', disabled: mode.value === 'view', class: 'w-full!' }
    },
    {
      key: 'accountingDate',
      label: '记账日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', disabled: true, class: 'w-full!' }
    },
    ...(isEntrustedProcessing.value
      ? [
          {
            key: 'customerId',
            label: '客户全称',
            type: 'input' as const,
            props: { disabled: mode.value === 'view' }
          },
          {
            key: 'customerCode',
            label: '客户编码',
            type: 'input' as const,
            props: { readonly: true, placeholder: '选择客户后自动带入' }
          }
        ]
      : [
          {
            key: 'supplierId',
            label: '供应商',
            type: 'input' as const,
            props: { disabled: mode.value === 'view' }
          },
          {
            key: 'supplierCode',
            label: '供应商编码',
            type: 'input' as const,
            props: { readonly: true, placeholder: '选择供应商后自动带入' }
          },
          {
            key: 'purchaserId',
            label: '采购员',
            type: 'input' as const,
            props: { disabled: mode.value === 'view' }
          },
          {
            key: 'purchaseDepartmentId',
            label: '采购部门',
            type: 'treeSelect' as const,
            api: fetchEnabledOrganizationTree,
            params: { tenantId: form.tenantId },
            resultField: 'data',
            labelField: 'organizationName',
            valueField: 'id',
            childrenField: 'children',
            props: {
              filterable: true,
              clearable: true,
              checkStrictly: true,
              renderAfterExpand: false,
              disabled: mode.value === 'view'
            }
          }
        ]),
    ...(isOtherInbound.value
      ? [
          {
            key: 'businessDepartmentId',
            label: '业务部门',
            type: 'treeSelect' as const,
            api: fetchEnabledOrganizationTree,
            params: { tenantId: form.tenantId },
            resultField: 'data',
            labelField: 'organizationName',
            valueField: 'id',
            childrenField: 'children',
            props: {
              filterable: true,
              clearable: true,
              checkStrictly: true,
              renderAfterExpand: false,
              disabled: mode.value === 'view',
              placeholder: '参选业务部门'
            }
          }
        ]
      : []),
    { key: 'keeperId', label: '仓管员', type: 'input', props: { disabled: mode.value === 'view' } },
    {
      key: 'warehouseId',
      label: '仓库',
      type: 'select',
      options: currentWarehouses.value.map((item) => ({
        label: `${item.warehouseName} · ${item.warehouseCode}`,
        value: item.id
      })),
      props: { filterable: true, clearable: true, disabled: mode.value === 'view' }
    },
    {
      key: 'status',
      label: '单据状态',
      type: 'select',
      options: [{ label: statusLabel.value, value: form.status }],
      props: { disabled: true }
    },
    ...(isInitial.value || props.kind === 'other_return'
      ? [
          {
            key: 'isInitialization',
            label: '初始化单据',
            type: 'switch' as const,
            props: { disabled: true }
          }
        ]
      : []),
    {
      key: 'remark',
      label: '备注',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 2,
        maxlength: 500,
        showWordLimit: true,
        disabled: mode.value === 'view'
      }
    }
  ])
  const headerRules = computed(() => ({
    ...(['purchase_return', 'entrusted_processing_return'].includes(props.kind)
      ? { warehouseId: [{ required: true, message: '请选择退货仓库', trigger: 'change' }] }
      : {}),
    organizationId: [{ required: true, message: '请选择已启用的库存组织', trigger: 'change' }],
    documentTypeId: [{ required: true, message: '请选择单据类型', trigger: 'change' }],
    businessTypeId: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
    businessDate: [{ required: true, message: '请选择业务日期', trigger: 'change' }],
    ...(isEntrustedProcessing.value
      ? { customerId: [{ required: true, message: '请选择客户', trigger: 'change' }] }
      : isOtherInbound.value
        ? {}
        : { supplierId: [{ required: true, message: '请选择供应商', trigger: 'change' }] })
  }))
  const partyColumns = [
    { prop: 'code', label: '编码', width: 150 },
    { prop: 'name', label: '名称', minWidth: 220 }
  ]
  const sourceBatchColumns: DataSelectColumn[] = [
    { prop: 'batchNo', label: '批号', minWidth: 200 },
    { prop: 'quantity', label: '现存数量', width: 120, align: 'right' },
    { prop: 'receivedAt', label: '入库时间', minWidth: 170 }
  ]
  function round(value: number, digits = 4): number {
    const factor = 10 ** digits
    return Math.round((value + Number.EPSILON) * factor) / factor
  }
  function displayQuantity(value: number): number {
    return isReturn.value && !isOpeningReturn.value
      ? -Math.abs(Number(value || 0))
      : Math.abs(Number(value || 0))
  }
  function processingQuantities(line?: WmsPurchaseLine): {
    received: number
    unreceived: number
    returned: number
    unreturned: number
  } {
    if (!line) return { received: 0, unreceived: 0, returned: 0, unreturned: 0 }
    const quantity = Math.abs(Number(line.quantity || 0))
    return {
      received: isEntrustedProcessing.value && !isReturn.value ? quantity : 0,
      unreceived: Number(line.unreceivedQuantity || 0),
      returned: isEntrustedProcessing.value && isReturn.value ? quantity : 0,
      unreturned: Number(line.unreturnedQuantity || 0)
    }
  }
  function unitName(id: string | null): string {
    return formatUnitDisplayName(units.value.find((item) => item.id === id)?.unitName, '') || '—'
  }
  function projectName(id: string | null): string {
    return projects.value.find((item) => item.id === id)?.name || '—'
  }
  function conversionFactor(
    material: WmsPurchaseMaterial | null | undefined,
    unitId: string | null
  ): number | null {
    if (!material || !unitId) return null
    if (unitId === material.baseUnitId) return 1
    const entry = material.unitConversions?.find((item) => item.sourceUnitId === unitId)
    return entry && entry.sourceFactor > 0 ? entry.baseFactor / entry.sourceFactor : null
  }
  function baseQuantity(line: WmsPurchaseLine): number {
    const inventoryFactor = conversionFactor(line.material, line.inventoryUnitId)
    const baseFactor = conversionFactor(line.material, line.baseUnitId)
    return inventoryFactor && baseFactor
      ? round((Math.abs(Number(line.quantity || 0)) * inventoryFactor) / baseFactor)
      : 0
  }
  function auxQuantity(line: WmsPurchaseLine, unitId: string | null): string {
    const inventoryFactor = conversionFactor(line.material, line.inventoryUnitId)
    const auxFactor = conversionFactor(line.material, unitId)
    return inventoryFactor && auxFactor
      ? round((Math.abs(Number(line.quantity || 0)) * inventoryFactor) / auxFactor).toString()
      : '—'
  }
  function lineFinancial(line: WmsPurchaseLine): {
    discount: number
    amount: number
    tax: number
    total: number
  } {
    if (mode.value === 'view' && isOpeningReturn.value)
      return {
        discount: Math.abs(Number(line.discountAmount || 0)),
        amount: Math.abs(Number(line.amount || 0)),
        tax: Math.abs(Number(line.taxAmount || 0)),
        total: Math.abs(Number(line.totalAmount || 0))
      }
    if (line.gift) return { discount: 0, amount: 0, tax: 0, total: 0 }
    const quantity = displayQuantity(line.quantity)
    const rate = line.discountMethod === 'none' ? 0 : Number(line.unitDiscountRate || 0)
    const discount = round(quantity * Number(line.taxInclusiveUnitPrice || 0) * rate, 2)
    const amount = round(quantity * Number(line.unitPrice || 0) - discount, 2)
    const tax = round((quantity * Number(line.unitPrice || 0) * Number(line.taxRate || 0)) / 100, 2)
    return { discount, amount, tax, total: round(amount + tax, 2) }
  }
  function updatePrice(line: WmsPurchaseLine, basis: 'untaxed' | 'taxed'): void {
    line.priceBasis = basis
    const factor = 1 + Number(line.taxRate || 0) / 100
    if (basis === 'taxed') line.unitPrice = round(Number(line.taxInclusiveUnitPrice || 0) / factor)
    else line.taxInclusiveUnitPrice = round(Number(line.unitPrice || 0) * factor)
  }
  function materialFromRow(row: DataSelectRecord): WmsPurchaseMaterial | null {
    if (typeof row.id !== 'string' || typeof row.code !== 'string' || typeof row.name !== 'string')
      return null
    return {
      id: row.id,
      tenantId: form.tenantId,
      code: row.code,
      name: row.name,
      description: typeof row.description === 'string' ? row.description : null,
      specificationModel:
        typeof row.specificationModel === 'string' ? row.specificationModel : null,
      inventoryUnitId: typeof row.inventoryUnitId === 'string' ? row.inventoryUnitId : null,
      baseUnitId: typeof row.baseUnitId === 'string' ? row.baseUnitId : null,
      auxiliaryUnitId: typeof row.auxiliaryUnitId === 'string' ? row.auxiliaryUnitId : null,
      auxiliaryUnit2Id: typeof row.auxiliaryUnit2Id === 'string' ? row.auxiliaryUnit2Id : null,
      unitConversions: Array.isArray(row.unitConversions) ? row.unitConversions : [],
      serialManagementEnabled: row.serialManagementEnabled === true
    }
  }
  function makeLine(material: WmsPurchaseMaterial): WmsPurchaseLine {
    return {
      lineNo: (lines.value.length + 1) * 10,
      materialId: material.id,
      material,
      projectId: null,
      constructionNo: null,
      gift: false,
      inventoryUnitId: material.inventoryUnitId || '',
      quantity: 0,
      baseUnitId: material.baseUnitId,
      baseQuantity: 0,
      unitPrice: 0,
      taxInclusiveUnitPrice: 0,
      priceBasis: 'untaxed',
      taxRate: 13,
      discountMethod: 'none',
      unitDiscountRate: 0,
      discountAmount: 0,
      amount: 0,
      taxAmount: 0,
      totalAmount: 0,
      batchNo: null,
      sourceBatchId: null,
      sourceOrderTargetLineId: null,
      warehouseId: form.warehouseId,
      binId: null,
      stockType: isEntrustedProcessing.value ? 'entrusted_processing' : 'normal',
      ownerType: isEntrustedProcessing.value ? 'customer' : 'self',
      ownerId: isEntrustedProcessing.value ? form.customerId || null : null,
      stockStatus: 'available',
      keeperId: form.keeperId,
      keeper: selectedKeeper.value[0] || null,
      purchaserId: props.kind === 'initial_inbound' ? form.purchaserId : null,
      purchaser: props.kind === 'initial_inbound' ? selectedPurchaser.value[0] || null : null,
      auxiliaryUnitId: material.auxiliaryUnitId,
      auxiliaryQuantity: null,
      auxiliaryUnit2Id: material.auxiliaryUnit2Id,
      auxiliaryQuantity2: null,
      productionDate: null,
      expiryDate: null,
      trackingNo: null,
      sourceDocument: null,
      sourceLineNo: null,
      remark: null,
      serialNos: [],
      receivedQuantity: 0,
      unreceivedQuantity: 0,
      returnedQuantity: 0,
      unreturnedQuantity: 0
    }
  }
  function renumber(): void {
    lines.value.forEach((line, index) => {
      line.lineNo = (index + 1) * 10
    })
  }
  function addMaterials(_ids: unknown, rows: DataSelectRecord[]): void {
    lines.value.push(
      ...rows
        .map(materialFromRow)
        .filter((row): row is WmsPurchaseMaterial => row !== null)
        .map(makeLine)
    )
    renumber()
    materialPickerIds.value = []
    materialPickerRows.value = []
  }
  function copyLine(index: number): void {
    if (['purchase_return', 'entrusted_processing_return'].includes(props.kind)) {
      ElMessage.warning('同一退货单不能重复添加物料')
      return
    }
    lines.value.splice(index + 1, 0, cloneDeep(lines.value[index]))
    renumber()
  }
  function removeLine(index: number): void {
    lines.value.splice(index, 1)
    renumber()
  }
  function lineIndex(line: WmsPurchaseLine): number {
    return lines.value.findIndex((item) => item.lineNo === line.lineNo)
  }
  function onLineMoreAction(item: ButtonMoreItem, line: WmsPurchaseLine): void {
    const index = lineIndex(line)
    if (index < 0) return
    if (item.key === 'copy-line') copyLine(index)
    else if (item.key === 'delete-line') removeLine(index)
  }
  function onPurchaserSelected(rows: EmployeeIntegrationItem[]): void {
    selectedPurchaser.value = rows
    if (rows[0]?.organizationId) form.purchaseDepartmentId = rows[0].organizationId
  }
  function onSupplierSelected(rows: DataSelectRecord[]): void {
    selectedSupplier.value = rows
    form.supplierCode = String(rows[0]?.code || '')
  }
  function onCustomerSelected(rows: DataSelectRecord[]): void {
    const previousCustomerId = form.customerId
    selectedHeaderCustomer.value = rows
    form.customerCode = String(rows[0]?.code || '')
    const customerId = String(rows[0]?.id || '')
    for (const line of lines.value) {
      if (line.ownerType === 'customer' && (!line.ownerId || line.ownerId === previousCustomerId)) {
        line.ownerId = customerId || null
      }
    }
  }
  function onInlineProjectChange(line: WmsPurchaseLine, projectId: string | null): void {
    if (line.projectId === projectId) return
    line.projectId = projectId
    line.constructionNo = null
    line.sourceBatchId = null
  }
  async function onInlineWarehouseChange(line: WmsPurchaseLine): Promise<void> {
    line.binId = null
    line.sourceBatchId = null
    await loadInlineBins(line)
  }

  function onInlineOwnerTypeChange(line: WmsPurchaseLine): void {
    line.ownerId = null
    line.sourceBatchId = null
  }
  function onInlineOwnerChange(line: WmsPurchaseLine, ownerId: string | null): void {
    line.ownerId = ownerId
    line.sourceBatchId = null
  }
  function onInlineSourceBatchSelected(line: WmsPurchaseLine, rows: DataSelectRecord[]): void {
    if (typeof rows[0]?.batchNo === 'string') line.batchNo = rows[0].batchNo
  }
  function sourceBatchApi(line: WmsPurchaseLine, params: DataSelectFetchParams) {
    if (!line.materialId || !line.warehouseId || !form.tenantId || !form.organizationId)
      return { data: [], total: 0 }
    return fetchWmsPurchaseSourceBatches({
      tenantId: form.tenantId,
      organizationId: form.organizationId,
      materialId: line.materialId,
      warehouseId: line.warehouseId,
      binId: line.binId,
      projectId: line.projectId,
      constructionNo: line.constructionNo,
      ownerType: line.ownerType,
      ownerId: line.ownerId,
      stockType: line.stockType,
      stockStatus: line.stockStatus,
      keyword: params.keyword || '',
      current: params.page,
      size: params.pageSize
    })
  }
  const serialList = computed(() => parseSerialNumberText(serialText.value))
  const serialEntryVisible = computed({
    get: () => false,
    set: (value: boolean) => {
      if (value) {
        serialEntryForm.serialText = serialText.value
        void serialEntryDialogRef.value?.handleOpen(undefined, {
          title: '录入序列号',
          showFooter: mode.value !== 'view',
          confirmText: '保存序列号',
          onConfirm: () => {
            serialText.value = serialEntryForm.serialText
            if (serialLine.value) serialLine.value.serialNos = serialList.value
            return true
          }
        })
      }
    }
  })
  const serialViewVisible = computed({
    get: () => false,
    set: (value: boolean) => {
      if (value) void serialViewDialogRef.value?.handleOpen(undefined, { title: '查看序列号' })
    }
  })
  async function importSerials(file: File): Promise<void> {
    try {
      const serials = parseSerialNumberText(await file.text())
      if (!serials.length) {
        ElMessage.warning('文件中没有可用的序列号，请检查文件内容后重试')
        return
      }
      serialEntryForm.serialText = serials.join('\n')
      ElMessage.success(`已导入 ${serials.length} 个序列号`)
    } catch (error) {
      notifyFriendlyError(error, '序列号文件读取失败，请重新选择文件')
    }
  }
  function openInlineSerials(line: WmsPurchaseLine): void {
    serialLine.value = line
    serialText.value = line.serialNos.join('\n')
    serialEntryVisible.value = mode.value !== 'view'
    if (mode.value === 'view') serialViewVisible.value = true
  }
  async function materialApi(params: DataSelectFetchParams) {
    const result = await fetchWmsPurchaseMaterials({
      tenantId: form.tenantId,
      keyword: params.keyword || '',
      categoryIds: getMaterialCategoryIds(
        materialCategories.value,
        String(params.filters.categoryId || '')
      ),
      current: params.page,
      size: params.pageSize
    })
    return {
      ...result,
      data: result.data.map((material) => ({
        ...material,
        materialCode: material.code,
        materialName: material.name
      }))
    }
  }
  async function loadTenantOptions(tenantId: string): Promise<void> {
    const [
      unitRows,
      documentRows,
      businessRows,
      projectRows,
      supplierRows,
      customerRows,
      menuId,
      categories,
      departmentRows
    ] = await Promise.all([
      fetchWmsPurchaseUnits(tenantId),
      fetchWmsPurchaseDocumentTypes(tenantId, documentTypeMenuName.value),
      fetchWmsPurchaseOptions('mdm_business_type', tenantId),
      fetchWmsPurchaseOptions('mdm_project', tenantId),
      fetchWmsPurchaseOptions('mdm_supplier', tenantId),
      fetchWmsPurchaseOptions('mdm_customer', tenantId),
      fetchWmsPurchaseMenuId(documentTypeMenuName.value),
      fetchWmsMaterialCategories(tenantId),
      isOtherInbound.value
        ? fetchWmsPurchaseOptions('mdm_organization', tenantId)
        : Promise.resolve([])
    ])
    units.value = unitRows
    const isOtherReturnType = (type: WmsPurchaseOption): boolean =>
      type.code === 'WMS_OTHER_RETURN' ||
      businessRows.some(
        (business) =>
          business.stockMovement === 'outbound' &&
          isWmsBusinessTypeAvailable(business, type.id, menuId)
      )
    documentTypes.value =
      props.kind === 'other_return'
        ? documentRows.filter(isOtherReturnType)
        : props.kind === 'other_inbound'
          ? documentRows.filter((item) => !isOtherReturnType(item))
          : documentRows
    businessTypes.value = businessRows
    businessMenuId.value = menuId
    projects.value = projectRows
    suppliers.value = supplierRows
    customers.value = customerRows
    materialCategories.value = categories
    businessDepartments.value = departmentRows
    if (!documentTypes.value.some((item) => item.id === form.documentTypeId))
      form.documentTypeId =
        documentTypes.value.find((item) => item.isDefault)?.id ||
        (props.kind === 'other_return' ? documentTypes.value[0]?.id : '') ||
        ''
    onDocumentTypeChange()
  }
  function onDocumentTypeChange(): void {
    const available = businessTypes.value.filter((item) =>
      isWmsBusinessTypeAvailable(item, form.documentTypeId, businessMenuId.value)
    )
    if (!available.some((item) => item.id === form.businessTypeId))
      form.businessTypeId = available.find((item) => item.isDefault)?.id || available[0]?.id || ''
  }
  async function onOrganizationChange(): Promise<void> {
    const org = selectedOrganization.value
    form.tenantId = org?.tenantId || ''
    form.businessDate = isInitial.value
      ? org?.enabledOn
        ? (dayjs().isAfter(org.enabledOn, 'day')
            ? dayjs(org.enabledOn).subtract(1, 'day')
            : dayjs()
          ).format('YYYY-MM-DD')
        : ''
      : dayjs().format('YYYY-MM-DD')
    form.documentTypeId = ''
    form.businessTypeId = ''
    if (!orderTarget.value) {
      form.supplierId = ''
      form.supplierCode = ''
      form.customerId = ''
      form.customerCode = ''
    }
    form.purchaserId = null
    form.purchaseDepartmentId = null
    form.businessDepartmentId = null
    form.warehouseId = null
    if (orderTarget.value) {
      lines.value.forEach((line) => {
        line.warehouseId = null
        line.binId = null
      })
    } else {
      lines.value = []
      selectedSupplier.value = []
      selectedHeaderCustomer.value = []
    }
    selectedPurchaser.value = []
    if (form.tenantId) await loadTenantOptions(form.tenantId)
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      const [orgPage, warehouseRows] = await Promise.all([
        fetchWmsInventoryOrganizationOptions(),
        fetchWmsPurchaseWarehouses()
      ])
      organizations.value = orgPage
      warehouses.value = warehouseRows
      if (mode.value === 'create' && !form.organizationId) {
        const defaultOrganization = availableOrganizations.value.find((item) => item.isDefault)
        if (defaultOrganization) {
          form.organizationId = defaultOrganization.id
          await onOrganizationChange()
        }
      }
      if (form.tenantId) await loadTenantOptions(form.tenantId)
    } catch {
      optionError.value = true
    } finally {
      drawerRef.value?.setOptions({
        confirmDisabled:
          parsing.value || importing.value || optionError.value || Boolean(documentError.value)
      })
    }
  }
  function onImportError(): void {
    ElMessage.error('导入失败，请检查 Excel 文件格式')
  }
  function onImportParsing(value: boolean): void {
    parsing.value = value
    drawerRef.value?.setOptions({
      confirmDisabled:
        parsing.value || importing.value || optionError.value || Boolean(documentError.value)
    })
  }
  async function importLines(rows: Array<Record<string, unknown>>): Promise<void> {
    if (importing.value || mode.value === 'view' || !form.organizationId) return
    const request = documentRequest
    const tenantId = form.tenantId
    const organizationId = form.organizationId
    importing.value = true
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      const resolveMaterial = createImportReferenceLookup(async (code) => {
        const result = await fetchWmsPurchaseMaterials({
          tenantId,
          keyword: '',
          materialCode: code,
          current: 1,
          size: 20
        })
        return result.data.filter((item) => item.code === code)
      })
      const importedLines: typeof lines.value = []
      for (const { row, code, fileRow, amounts } of readWmsDocumentImportRows(rows)) {
        const material = await resolveMaterial(code, `第 ${fileRow} 行当前租户物料编码“${code}”`)
        if (request !== documentRequest) return
        const line = makeLine(material)
        line.quantity = amounts.quantity
        line.unitPrice = amounts.unitPrice
        line.taxRate = amounts.taxRate
        line.taxInclusiveUnitPrice = round(line.unitPrice * (1 + line.taxRate / 100))
        line.batchNo = String(row['批号'] || row.batchNo || '') || null
        importedLines.push(line)
      }
      if (request !== documentRequest) return
      if (form.tenantId !== tenantId || form.organizationId !== organizationId)
        throw new Error('库存组织已变更，请重新导入明细')
      lines.value.push(...importedLines)
      renumber()
      ElMessage.success(`已导入 ${importedLines.length} 行，请逐行核对仓储与价格信息`)
    } catch (error) {
      if (request !== documentRequest) return
      notifyFriendlyError(error, '导入物料读取失败，请检查网络后重新选择文件')
    } finally {
      if (request === documentRequest) {
        importing.value = false
        drawerRef.value?.setOptions({
          confirmDisabled:
            parsing.value || importing.value || optionError.value || Boolean(documentError.value)
        })
      }
    }
  }
  async function save(): Promise<boolean> {
    if (parsing.value || importing.value || optionError.value || documentError.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (
        isInitial.value &&
        (!selectedOrganization.value?.enabledOn ||
          form.businessDate > selectedOrganization.value.enabledOn)
      ) {
        ElMessage.warning('业务日期不得晚于库存组织启用日期')
        return false
      }
      if (!lines.value.length) {
        ElMessage.warning('请至少添加一行物料')
        return false
      }
      if (props.kind === 'initial_inbound') {
        for (const line of lines.value) {
          line.warehouseId ||= form.warehouseId
          if (!line.purchaserId) {
            line.purchaserId = form.purchaserId
            line.purchaser = selectedPurchaser.value[0] || null
          }
          if (!line.keeperId) line.keeper = selectedKeeper.value[0] || null
          line.keeperId ||= form.keeperId
        }
      }
      const validation = await lineTableRef.value?.validate()
      if (!validation?.valid) {
        if (validation?.firstError) ElMessage.warning(validation.firstError.message)
        return false
      }
      const incomplete = lines.value.find((line) => Math.abs(Number(line.quantity)) <= 0)
      if (incomplete) {
        ElMessage.warning(`第 ${incomplete.lineNo} 行“数量”不能为零`)
        return false
      }
      for (const line of lines.value) {
        if (isInitial.value && line.material?.batchManagementEnabled && !line.batchNo?.trim()) {
          ElMessage.warning(`第 ${line.lineNo} 行批次管理物料请填写期初历史批次`)
          return false
        }
        if (
          !isEntrustedProcessing.value &&
          !isOtherInbound.value &&
          line.projectId &&
          !line.constructionNo?.trim()
        ) {
          ElMessage.warning(`第 ${line.lineNo} 行选择项目后请填写施工号`)
          return false
        }
        if (line.ownerType !== 'self' && !line.ownerId) {
          ElMessage.warning(`第 ${line.lineNo} 行请选择货主`)
          return false
        }
        const serials = line.serialNos
        if (
          line.material?.serialManagementEnabled &&
          (Math.abs(Number(line.quantity)) !== serials.length ||
            new Set(serials).size !== serials.length)
        ) {
          ElMessage.warning(`第 ${line.lineNo} 行序列号数量须与物料数量一致且不能重复`)
          return false
        }
        line.quantity = Math.abs(Number(line.quantity))
        line.baseQuantity = baseQuantity(line)
        const money = lineFinancial(line)
        line.discountAmount = money.discount
        line.amount = money.amount
        line.taxAmount = money.tax
        line.totalAmount = money.total
        const processing = processingQuantities(line)
        line.receivedQuantity = processing.received
        line.unreceivedQuantity = processing.unreceived
        line.returnedQuantity = processing.returned
        line.unreturnedQuantity = processing.unreturned
      }
      await saveWmsPurchaseDocument({
        id: mode.value === 'edit' ? form.id : undefined,
        tenantId: form.tenantId,
        organizationId: form.organizationId,
        kind: props.kind,
        documentTypeId: form.documentTypeId,
        businessTypeId: form.businessTypeId,
        businessDate: form.businessDate,
        supplierId: form.supplierId,
        customerId: form.customerId,
        purchaserId: form.purchaserId,
        purchaseDepartmentId: form.purchaseDepartmentId,
        businessDepartmentId: form.businessDepartmentId,
        keeperId: form.keeperId,
        warehouseId: form.warehouseId,
        isInitialization: isInitial.value,
        remark: normalizeNullableText(form.remark),
        lines: lines.value
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, `${title.value}提交失败，请检查填写内容和网络后重试`)
      return false
    }
  }
  async function handleOpen(data: OpenData): Promise<void> {
    documentRequest += 1
    importing.value = false
    parsing.value = false
    openData.value = data
    documentError.value = ''
    mode.value = data.mode
    orderTarget.value = null
    orderTargets.value = []
    importIntent.value = Boolean(data.importIntent)
    await drawerRef.value?.handleOpen(data, {
      loading: true,
      loadingText: '正在加载单据资料…',
      showFooter: data.mode !== 'view',
      confirmText: data.mode === 'copy' ? '保存副本' : '保存',
      title:
        data.mode === 'create'
          ? `新增${title.value}`
          : data.mode === 'copy'
            ? `复制${title.value}`
            : data.mode === 'edit'
              ? `编辑${title.value}`
              : `${title.value}详情`,
      subtitle: data.document?.documentNo || '月度三位流水号自动生成',
      onConfirm: save,
      onClose: () => {
        documentRequest += 1
        importing.value = false
        parsing.value = false
        openData.value = undefined
      }
    })
    await reloadDocument()
  }
  async function reloadDocument(): Promise<void> {
    const data = openData.value
    if (!data) return
    const request = ++documentRequest
    documentError.value = ''
    drawerRef.value?.setLoading(true)
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      const source =
        data.document ??
        (data.documentId ? await fetchWmsPurchaseDocument(data.documentId) : undefined)
      if (request !== documentRequest) return
      currentDocument.value = source ?? null
      headerProjectId.value = source?.lines[0]?.projectId || null
      Object.assign(form, {
        id: data.mode === 'edit' ? source?.id || '' : '',
        tenantId: source?.tenantId || '',
        organizationId: source?.organizationId || '',
        documentNo: data.mode === 'copy' ? '' : source?.documentNo || '',
        documentTypeId: source?.documentTypeId || '',
        businessTypeId: source?.businessTypeId || '',
        businessDate: source?.businessDate || '',
        accountingDate: source?.accountingDate || dayjs().format('YYYY-MM-DD'),
        supplierId: source?.supplierId || '',
        supplierCode: source?.supplier?.supplierCode || '',
        customerId: source?.customerId || '',
        customerCode: source?.customer?.customerCode || '',
        purchaserId: source?.purchaserId || null,
        purchaseDepartmentId: source?.purchaseDepartmentId || null,
        businessDepartmentId: source?.businessDepartmentId || null,
        keeperId: source?.keeperId || null,
        warehouseId: source?.warehouseId || null,
        status: data.mode === 'copy' ? 'draft' : source?.status || 'draft',
        isInitialization: isInitial.value,
        remark: source?.remark || ''
      })
      if (source && source.kind !== props.kind) {
        form.documentTypeId = ''
        form.businessTypeId = ''
      }
      lines.value = source ? cloneDeep(source.lines) : []
      if (data.sourceLineIds?.length) {
        lines.value = lines.value.filter((line) => line.id && data.sourceLineIds?.includes(line.id))
        if (!lines.value.length) throw new Error('选中的来源明细已变化，请刷新列表后重试')
      }
      if (data.mode === 'create' && source && props.kind === 'other_return') {
        form.documentNo = ''
        form.status = 'draft'
        lines.value.forEach((line) => {
          line.sourceDocument = source.documentNo
          line.sourceLineNo = String(line.lineNo)
          line.movementId = null
        })
      }
      if (data.mode !== 'view') {
        for (const line of lines.value) line.quantity = Math.abs(Number(line.quantity))
      }
      selectedSupplier.value = []
      selectedHeaderCustomer.value = []
      selectedPurchaser.value = source?.purchaser ? [source.purchaser] : []
      selectedKeeper.value = source?.keeper ? [source.keeper] : []
      if (
        data.mode === 'create' &&
        (data.orderTargetId || data.orderTargets?.length) &&
        props.kind === 'purchase_inbound'
      ) {
        const requests = data.orderTargets ?? [{ targetId: data.orderTargetId!, sourceLineIds: [] }]
        orderTargets.value = await Promise.all(
          requests.map(async (request) => {
            const target = await fetchWmsPurchaseOrderTarget(request.targetId)
            return {
              ...target,
              lines: request.sourceLineIds.length
                ? target.lines.filter((line) => request.sourceLineIds.includes(line.sourceLineId))
                : target.lines
            }
          })
        )
        const first = orderTargets.value[0]
        if (
          !first ||
          orderTargets.value.some(
            (target) => target.tenantId !== first.tenantId || target.supplierId !== first.supplierId
          )
        ) {
          throw new Error('请选择同一租户、同一供应商的来源单据')
        }
        if (!orderTargets.value.every((target) => target.lines.length)) {
          throw new Error('选中明细已无可入库数量，请刷新后重试')
        }
        orderTarget.value = first
        form.tenantId = orderTarget.value.tenantId
        form.supplierId = orderTarget.value.supplierId
      }
      await loadOptions()
      if (request !== documentRequest) return
      if (form.supplierId) {
        const supplier = suppliers.value.find((item) => item.id === form.supplierId)
        selectedSupplier.value = supplier ? [supplier] : []
      }
      if (form.customerId) {
        const customer = customers.value.find((item) => item.id === form.customerId)
        selectedHeaderCustomer.value = customer ? [customer] : []
      }
      if (orderTarget.value) {
        const target = orderTarget.value
        form.purchaserId = orderTargets.value.every(
          (item) => item.purchaserId === target.purchaserId
        )
          ? target.purchaserId
          : null
        form.keeperId = orderTargets.value.every((item) => item.keeperId === target.keeperId)
          ? target.keeperId
          : null
        form.supplierCode =
          suppliers.value.find((item) => item.id === target.supplierId)?.code || ''
        lines.value = orderTargets.value.flatMap((target) =>
          target.lines.map((line) => targetLineToLine(target, line))
        )
        renumber()
      }
      if (request !== documentRequest) return
      await nextTick()
      formRef.value?.clearValidate()
      drawerRef.value?.setOptions({ subtitle: source?.documentNo || '月度三位流水号自动生成' })
    } catch (error) {
      if (request !== documentRequest) return
      documentError.value = '请重新加载单据；如仍失败，请检查网络和当前单据的查看权限。'
      notifyFriendlyError(error, '单据加载失败，请重试')
    } finally {
      if (request === documentRequest) {
        drawerRef.value?.setLoading(false)
        drawerRef.value?.setOptions({
          confirmDisabled:
            parsing.value || importing.value || optionError.value || Boolean(documentError.value)
        })
      }
    }
  }
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  @use '@/assets/styles/core/mixin' as layout;

  .wms-editable-line-table {
    @include layout.fill-editable-table-cells;
  }

  .initialization-document-stack {
    display: grid;
    gap: 20px;
    align-content: start;
  }

  .purchase-return-quantity {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
  }

  :deep(td.el-table__cell.purchase-return-quantity-cell) {
    background-color: var(--el-color-warning-light-9) !important;
  }

  :deep(td.el-table__cell.opening-return-value-cell),
  :deep(td.el-table__cell.opening-return-value-cell .el-input__inner) {
    color: var(--el-color-danger);
  }
</style>
