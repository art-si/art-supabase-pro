import { createApp, h, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import dayjs from 'dayjs'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import PpeDialog from '@smis/views/safety-production/protective-equipment-management/ppe-issuance-record/modules/issuance-record-dialog.vue'
import ToolDialog from '@smis/views/safety-production/tool-requisition/tool-issuance-record/modules/issuance-record-dialog.vue'
import type { SmisPpeIssuanceRecord } from '@smis/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(window.location.search).get('mode') === 'tool' ? 'tool' : 'ppe'
const tenantId = '11111111-1111-4111-8111-111111111111'
const row: SmisPpeIssuanceRecord = {
  id: 'issuance-test',
  tenantId,
  issuanceNo: 'ISS-2026-001',
  employeeId: 'employee-test',
  employeeNo: 'EMP-001',
  employeeName: '测试领用人',
  positionName: '设备员',
  organizationId: 'organization-test',
  organizationName: '测试车间',
  warehouseId: 'warehouse-test',
  warehouseName: '测试发放仓库',
  issuerEmployeeId: 'issuer-test',
  issuerName: '测试发放人',
  issueDate: '2026-10-05',
  status: 'draft',
  remark: '原始备注',
  items: [
    {
      id: 'item-test',
      materialId: 'material-test',
      materialCategory: '测试分类',
      materialName: mode === 'tool' ? '测试工器具' : '测试防护用品',
      specificationModel: 'M-01',
      unit: '件',
      issueQuantity: 2,
      remark: '明细备注'
    }
  ]
}

Object.defineProperty(window, '__smisIssuanceRecordSnapshot', {
  value: () => structuredClone(row),
  configurable: true
})

const app = createApp({
  setup() {
    const ppeDialog = shallowRef<InstanceType<typeof PpeDialog>>()
    const toolDialog = shallowRef<InstanceType<typeof ToolDialog>>()
    const open = (recordMode: 'edit' | 'copy') =>
      mode === 'tool'
        ? toolDialog.value?.handleOpen({ mode: recordMode, row })
        : ppeDialog.value?.handleOpen({ mode: recordMode, row })

    return () =>
      h('main', { class: 'p-4 flex gap-3' }, [
        h('button', { type: 'button', onClick: () => open('edit') }, '打开编辑'),
        h('button', { type: 'button', onClick: () => open('copy') }, '打开复制'),
        h('output', { 'data-testid': 'fixture-today' }, dayjs().format('YYYY-MM-DD')),
        mode === 'tool' ? h(ToolDialog, { ref: toolDialog }) : h(PpeDialog, { ref: ppeDialog })
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'issuance-edit-copy-test',
  tenantId,
  platformSuper: false
})
app.mount('#smis-issuance-edit-copy-preview')
