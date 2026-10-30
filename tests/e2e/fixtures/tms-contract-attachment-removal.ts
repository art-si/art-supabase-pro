import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import ContractDialog from '@tms/views/basic-data/contract/modules/contract-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const attachments = (prefix: string) => [
  {
    name: `${prefix}旧合同附件`,
    url: 'https://example.invalid/shared-contract.pdf',
    fileType: 'pdf'
  },
  {
    name: `${prefix}新合同附件`,
    url: 'https://example.invalid/shared-contract.pdf',
    fileType: 'pdf'
  }
]
const base: Api.Tms.BasicData.Contract = {
  id: 'contract-a',
  tenantId: tenantA,
  contractNo: 'CONTRACT-A',
  contractName: 'A 运输合同',
  contractStatus: 'draft',
  contractCategory: 'transport',
  transportMode: 'road',
  businessContractType: 'customer',
  billingMethod: 'monthly',
  signTime: '2026-10-30',
  isCompleted: false,
  handler: '测试经办人',
  transportDetails: [],
  attachments: attachments('A'),
  fieldAccess: { attachments: 'edit' },
  isRecordOwner: true
}
const contractB: Api.Tms.BasicData.Contract = {
  ...base,
  id: 'contract-b',
  contractNo: 'CONTRACT-B',
  contractName: 'B 运输合同',
  attachments: attachments('B')
}
const dialogRef = ref<InstanceType<typeof ContractDialog>>()
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-w-0 p-4' }, h(ContractDialog, { ref: dialogRef }))
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'TmsContract', component: { render: () => h('div') } }]
  })
)
setupGlobDirectives(app)
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'contract-attachment-test',
  tenantId: tenantA,
  platformSuper: true
})
const tenantScope = useTenantScopeStore(store)
tenantScope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '甲租户' },
  { id: tenantB, tenantCode: 'B', tenantName: '乙租户' }
]
tenantScope.setTenantScope(tenantA)
initializeTheme()
app.mount('#app')
Object.assign(window, {
  __tmsContractAttachmentTest: {
    openA() {
      return dialogRef.value?.handleOpen(base)
    },
    openB(readOnly = false) {
      return dialogRef.value?.handleOpen(
        readOnly
          ? {
              ...contractB,
              id: 'contract-b-readonly',
              fieldAccess: { attachments: 'read' },
              isRecordOwner: false
            }
          : contractB
      )
    },
    switchTenantB() {
      tenantScope.setTenantScope(tenantB)
    },
    switchIdentityB() {
      userStore.setUserInfo({
        userId: 'contract-other-user',
        tenantId: tenantB,
        platformSuper: false
      })
    }
  }
})
