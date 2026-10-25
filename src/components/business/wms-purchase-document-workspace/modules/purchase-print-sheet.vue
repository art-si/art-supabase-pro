<template>
  <Teleport to="body">
    <div class="wms-purchase-print-batch" aria-hidden="true">
      <article v-for="record in records" :key="record.id" class="wms-purchase-print-sheet">
        <h1>{{ printTitle(record) }}</h1>
        <div class="wms-purchase-print-sheet__meta">
          <span>{{ isReturn(record) ? '退货' : '入库' }}单号：{{ record.documentNo }}</span>
          <span>{{ isReturn(record) ? '退货' : '入库' }}日期：{{ record.businessDate }}</span>
          <span>仓库：{{ warehouseName(record) }}</span>
        </div>
        <div class="wms-purchase-print-sheet__meta">
          <span
            >{{ record.kind.startsWith('entrusted_processing_') ? '客户' : '供应商' }}：{{
              record.kind.startsWith('entrusted_processing_')
                ? record.customer?.customerName || '—'
                : record.supplier?.supplierName || '—'
            }}</span
          >
          <span>项目：{{ projectNames(record) }}</span>
          <span>业务类型：{{ businessType(record) }}</span>
        </div>
        <table>
          <thead
            ><tr
              ><th>物料编号</th><th>物料描述</th><th>单位</th><th>数量</th><th>单价</th><th>金额</th
              ><template v-if="hasProjectColumns(record)"
                ><th>项目 / 施工号</th><th>批次 / 库位</th></template
              ><template v-if="isReturn(record)"><th>税额</th><th>价税合计</th></template></tr
            ></thead
          >
          <tbody>
            <tr v-for="line in record.lines" :key="line.id || line.lineNo">
              <td>{{ line.material?.code || '—' }}</td
              ><td>{{ line.material?.description || line.material?.name || '—' }}</td>
              <td>{{ unitDisplayName(record.tenantId, line.inventoryUnitId) }}</td
              ><td :class="{ negative: line.quantity < 0 }">{{
                formatNumberValue(line.quantity)
              }}</td>
              <td>{{ formatCurrencyValue(line.unitPrice) }}</td
              ><td :class="{ negative: line.amount < 0 }">{{
                formatCurrencyValue(line.amount)
              }}</td>
              <template v-if="hasProjectColumns(record)"
                ><td>{{ line.project?.name || '—' }} / {{ line.constructionNo || '—' }}</td
                ><td>{{ line.batchNo || '—' }} / {{ line.bin?.binName || '—' }}</td></template
              ><template v-if="isReturn(record)"
                ><td :class="{ negative: line.taxAmount < 0 }">{{
                  formatCurrencyValue(line.taxAmount)
                }}</td
                ><td :class="{ negative: line.totalAmount < 0 }">{{
                  formatCurrencyValue(line.totalAmount)
                }}</td></template
              >
            </tr>
            <tr
              ><td>总计：</td
              ><td :colspan="5 + (hasProjectColumns(record) ? 2 : 0) + (isReturn(record) ? 2 : 0)"
                >{{ formatCurrencyValue(record.lines.reduce((sum, line) => sum + line.amount, 0))
                }}<template v-if="isReturn(record)"
                  >；价税合计：{{
                    formatCurrencyValue(
                      record.lines.reduce((sum, line) => sum + line.totalAmount, 0)
                    )
                  }}</template
                ></td
              ></tr
            >
          </tbody>
        </table>
        <p v-if="isReturn(record) || record.kind.startsWith('entrusted_processing_')"
          >{{ isReturn(record) ? '退货原因 / 备注' : '加工事项 / 备注' }}：{{
            record.remark || '—'
          }}</p
        >
        <div class="wms-purchase-print-sheet__meta"
          ><span>负责人：</span><span>库管员：{{ record.keeper?.employeeName || '' }}</span
          ><span>采购员：{{ record.purchaser?.employeeName || '' }}</span
          ><span v-if="isReturn(record)"
            >{{
              record.kind.startsWith('entrusted_processing_') ? '客户签收' : '供应商签收'
            }}：</span
          ></div
        >
      </article>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
  import type { WmsPurchaseDocument, WmsPurchaseWarehouse } from '@/api/wms-purchase'
  import { fetchWmsPurchaseWarehouses } from '@/api/wms-purchase'
  import { usePrintSheet } from '@/hooks/core/usePrintSheet'
  import { useUnitDisplayNames } from '@/hooks/core/useUnitDisplayNames'
  import { formatCurrencyValue, formatNumberValue } from '@/utils/ui/format'
  import { uniq } from 'lodash-es'
  function isReturn(record: WmsPurchaseDocument): boolean {
    return record.kind.endsWith('_return')
  }
  function hasProjectColumns(record: WmsPurchaseDocument): boolean {
    return isReturn(record) || record.kind === 'entrusted_processing_inbound'
  }
  function businessType(record: WmsPurchaseDocument): string {
    return record.kind.startsWith('entrusted_processing_')
      ? isReturn(record)
        ? '受托加工材料退货'
        : '受托加工材料收货'
      : isReturn(record)
        ? '采购退货'
        : '采购收货'
  }
  function printTitle(record: WmsPurchaseDocument): string {
    return (
      (
        {
          purchase_inbound: '入库单',
          purchase_return: '项目采购退货单',
          entrusted_processing_inbound: '项目受托加工材料入库单',
          entrusted_processing_return: '项目受托加工材料退货单'
        } as Partial<Record<WmsPurchaseDocument['kind'], string>>
      )[record.kind] || '库存单据'
    )
  }
  const records = ref<WmsPurchaseDocument[]>([])
  const warehouses = ref<WmsPurchaseWarehouse[]>([])
  const { loadUnitDisplayNames, unitDisplayName } = useUnitDisplayNames()
  const { print: printSheet } = usePrintSheet('is-wms-purchase-printing', () => {
    records.value = []
  })
  function warehouseName(record: WmsPurchaseDocument): string {
    return (
      uniq(
        [record.warehouseId, ...record.lines.map((line) => line.warehouseId)]
          .filter(Boolean)
          .map(
            (id) => warehouses.value.find((warehouse) => warehouse.id === id)?.warehouseName || '—'
          )
      ).join('、') || '—'
    )
  }
  function projectNames(record: WmsPurchaseDocument): string {
    return uniq(record.lines.map((line) => line.project?.name).filter(Boolean)).join('、') || '—'
  }
  async function print(rows: WmsPurchaseDocument[]): Promise<void> {
    const [, warehouseRows] = await Promise.all([
      loadUnitDisplayNames(rows.map((row) => row.tenantId)),
      fetchWmsPurchaseWarehouses()
    ])
    warehouses.value = warehouseRows
    records.value = rows
    await printSheet()
  }
  defineExpose({ print })
</script>
<style lang="scss">
  .wms-purchase-print-batch {
    display: none;
  }

  @media print {
    body.is-wms-purchase-printing {
      background: #fff;

      > *:not(.wms-purchase-print-batch) {
        display: none !important;
      }

      > .wms-purchase-print-batch {
        display: block !important;
      }
    }

    .wms-purchase-print-sheet {
      padding: 8mm;
      font-family: 'Microsoft YaHei', Arial, sans-serif;
      font-size: 12px;
      color: #000;
      break-after: page;

      &:last-child {
        break-after: auto;
      }

      h1 {
        margin: 0 0 8mm;
        font-size: 28px;
        text-align: center;
        text-decoration: underline;
      }

      &__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 4mm;
        justify-content: space-between;
        margin: 5mm 0;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 4mm 2mm;
        overflow-wrap: anywhere;
        border: 1px solid #000;
      }

      thead {
        display: table-header-group;
      }

      tr {
        break-inside: avoid;
      }

      .negative {
        color: #c00;
      }
    }
  }
</style>
