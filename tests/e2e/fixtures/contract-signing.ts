import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import ContractDocumentPreview from '@/components/business/contract-document-preview/index.vue'
import ContractSigningDialog from '@/components/business/contract-signing-dialog/index.vue'
import type { ContractSigningInput } from '@/components/business/contract-signing-dialog/types'
import type { ContractDocument } from '@/components/business/contract-document-preview/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const previewRef = ref<InstanceType<typeof ContractDocumentPreview>>()
const signingRef = ref<InstanceType<typeof ContractSigningDialog>>()
const submitted = ref<ContractSigningInput>()
const attempts = ref(0)
const params = new URLSearchParams(location.search)
const contractDocument: ContractDocument = {
  title: '货物运输协议 · 验收样本',
  documentNo: 'YSXY-TEST-002',
  startsOn: '2026-11-01',
  endsOn: '2027-10-31',
  partyA: { label: '托运方', name: '甲方运输测试公司', representative: '测试甲方代表' },
  partyB: { label: '承运方', name: '乙方物流测试公司', representative: '测试乙方代表' },
  facts: [
    { label: '联系电话', value: '13800000000' },
    { label: '车牌号码', value: '测A00002' },
    { label: '车型及车长', value: '重型厢式货车 · 9.6 米' }
  ],
  contentHtml:
    '<h2>第一条：运输要求及责任范围</h2><p>车辆须符合安全标准，货物交接应清晰记录。</p><p>' +
    '双方确认运输时间、货物数量及收货要求。'.repeat(18) +
    '</p><script>window.contractUnsafe=true</script>',
  attachments: [],
  certificateGroups: ['身份证', '驾驶证', '行驶证', '道路运输证'].map((label) => ({
    label,
    urls: []
  }))
}

if (params.get('signed') === 'true') {
  contractDocument.attachments = ['/tests/e2e/fixtures/运输补充条款.pdf']
  contractDocument.certificateGroups?.forEach((group) => {
    group.urls = ['/tests/e2e/fixtures/contract-seal.svg']
  })
  for (const party of [contractDocument.partyA, contractDocument.partyB]) {
    party.signatureUrl = '/tests/e2e/fixtures/contract-signature.svg'
    party.sealUrl = '/tests/e2e/fixtures/contract-seal.svg'
    party.signedOn = '2026-11-04T08:00:00Z'
  }
}

const app = createApp({
  render: () =>
    h('main', { class: 'min-h-screen p-4' }, [
      h('div', { class: 'flex flex-wrap gap-4' }, [
        h(
          'button',
          { type: 'button', onClick: () => void previewRef.value?.handleOpen(contractDocument) },
          '预览运输协议'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              void previewRef.value?.handleOpen({
                ...contractDocument,
                title: '电子运输合同 · 验收样本',
                documentNo: 'DZHT-TEST-001',
                settlementText: '按月每期 10 日起 · 账期 45 天 · 税率 9%'
              })
          },
          '预览电子合同'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              void signingRef.value?.handleOpen({
                title: '合同签署',
                documentNo: 'DZHT-TEST-001',
                tenantId,
                partyAName: '甲方运输测试公司',
                partyBName: '乙方物流测试公司',
                onSubmit: async (input) => {
                  attempts.value++
                  if (params.get('retry') === 'true' && attempts.value === 1)
                    throw new Error('审批状态已变化，请刷新确认后重试')
                  submitted.value = input
                }
              })
          },
          '打开签署'
        )
      ]),
      h('output', { 'data-testid': 'submitted' }, JSON.stringify(submitted.value || null)),
      h('output', { 'data-testid': 'attempts' }, String(attempts.value)),
      h(ContractDocumentPreview, { ref: previewRef }),
      h(ContractSigningDialog, { ref: signingRef })
    ])
})
app.use(store)
useUserStore(store).setUserInfo({ userId: 'contract-test', tenantId, platformSuper: false })
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }]
  })
)
app.use(language)
setupGlobDirectives(app)
initializeTheme()
useTheme().switchThemeStyles(
  params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
)
document.documentElement.dataset.boxMode = params.get('box') || 'border-mode'
app.mount('#contract-signing')
