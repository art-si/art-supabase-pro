import type { ComputedRef, InjectionKey } from 'vue'
import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'

/** A row command uses its own record, never the table's checkbox selection. */
export interface TableRowCommands {
  items: (row: object) => ButtonMoreItem[]
  run: (key: string | number, row: object) => Promise<void>
}

export const tableRowCommandsKey: InjectionKey<TableRowCommands> = Symbol('table-row-commands')
export const tableActionRowKey: InjectionKey<ComputedRef<object | undefined>> =
  Symbol('table-action-row')
export const tableRowActionOwnerKey: InjectionKey<boolean> = Symbol('table-row-action-owner')

export const singleActionLabel = (label: string): string => label.replace(/^批量/, '')

/** Range-level commands have no meaningful single-record counterpart. */
export function isRangeAction(key: string | number, label: string): boolean {
  return /export|import|导出|导入|当前范围|全部范围|处理待办/.test(`${key}:${label}`)
}

export function actionIdentity(item: Pick<ButtonMoreItem, 'key' | 'label'>): string {
  const label = singleActionLabel(item.label).replace(/单据$/, '')
  if (/^提交/.test(label)) return 'submit'
  if (/^撤回/.test(label)) return 'withdraw'
  if (/^(删除|注销)/.test(label)) return 'delete'
  if (/^复制/.test(label)) return 'copy'
  if (/^(审核通过|审核)$/.test(label)) return 'approve'
  return label
}

/** Shared semantic icons keep selection and single-record commands consistent. */
export function commandIcon(key: string | number, label: string): string | undefined {
  const action = `${key}:${label}`
  if (/二维码/.test(action)) return 'ri:qr-code-line'
  if (/print|打印/.test(action)) return 'ri:printer-line'
  if (/delete|remove|删除|注销/.test(action)) return 'ri:delete-bin-line'
  if (/copy|复制/.test(action)) return 'ri:file-copy-line'
  if (/unbind|解绑/.test(action)) return 'ri:link-unlink-m'
  if (/bind|绑定/.test(action)) return 'ri:link-m'
  if (/disable|停用|禁用/.test(action)) return 'ri:forbid-line'
  if (/enable|启用|生效/.test(action)) return 'ri:checkbox-circle-line'
  if (/withdraw|撤回/.test(action)) return 'ri:arrow-go-back-line'
  if (/reject|驳回|审核拒绝/.test(action)) return 'ri:close-circle-line'
  if (/cancel|取消|作废/.test(action)) return 'ri:close-circle-line'
  if (/submit|提交/.test(action)) return 'ri:send-plane-line'
  if (/approve|审核|审查/.test(action)) return 'ri:checkbox-circle-line'
  if (/export|导出/.test(action)) return 'ri:download-2-line'
  if (/退回|退货/.test(label)) return 'ri:arrow-go-back-line'
  if (/转固/.test(label)) return 'ri:building-2-line'
  if (/专用发票/.test(label)) return 'ri:file-paper-2-line'
  if (/普通发票/.test(label)) return 'ri:bill-line'
  if (/下推.*收料通知/.test(action)) return 'ri:file-list-3-line'
  if (/下推.*(采购入库|收料入库)/.test(action)) return 'ri:inbox-archive-line'
  if (/下推.*财务应付/.test(action)) return 'ri:money-dollar-circle-line'
  if (/下推.*暂估应付/.test(action)) return 'ri:bill-line'
  if (/下推.*采购订单/.test(action)) return 'ri:shopping-cart-line'
  if (/push|convert|下推|转费用/.test(action)) return 'ri:file-transfer-line'
  if (/edit|修改|编辑/.test(action)) return 'ri:edit-line'
  if (/view|detail|查看|详情/.test(action)) return 'ri:eye-line'
  return undefined
}
