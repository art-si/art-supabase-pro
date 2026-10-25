import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import language from '@/locales'
import OcrOriginalText from '@/components/business/ocr-original-text/index.vue'
import AiConfiguration from '@/views/system/ai-configuration/index.vue'
import AiPromptDialog from '@/views/system/ai-prompt/modules/ai-prompt-dialog.vue'
import { useProjectAssistantChat } from '@/views/data-center/supabase-ai-assistant/modules/use-project-assistant-chat'
import Payroll from '@fms/views/specialized-accounting/payroll/index.vue'
import FinanceWorkbench from '@fms/views/workbench/index.vue'
import AutoPosting from '@fms/views/accounting/auto-posting/index.vue'
import { fetchMdmCatalogPage } from '@mdm/api/modules/catalog'
import OpeningBalance from '@fms/views/accounting/opening-balance/index.vue'
import VoucherLines from '@fms/views/modules/voucher-entry-lines.vue'
import ViolationStandards from '@smis/views/safety-production/anti-violation-management/anti-violation-standard-library/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const subject: Api.Fms.SubjectRecord = {
  id: 'subject-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  accountSetId: 'account-test',
  subjectCode: '1001',
  subjectName: '数量和外币测试科目',
  category: 'asset',
  balanceDirection: 'debit',
  level: 1,
  isSystem: false,
  isEnabled: true,
  allowQuantity: true,
  unitName: '件',
  allowForeignCurrency: true,
  allowPeriodEndRevaluation: false,
  cashFlowRequired: false,
  sort: 0,
  createTime: '',
  updateTime: ''
}
const lines: Api.Fms.VoucherLineRecord[] = [1234.56789, 0].map((value, index) => ({
  lineNo: index + 1,
  summary: `格式验收分录 ${index + 1}`,
  subjectId: subject.id,
  auxiliaryValues: {},
  currencyId: 'eur-test',
  currencyCodeSnapshot: 'EUR',
  exchangeRate: 1,
  originalAmount: value,
  quantity: value,
  debitAmount: value,
  creditAmount: 0
}))

const app = createApp(
  defineComponent({
    setup() {
      const prompt = ref<InstanceType<typeof AiPromptDialog>>()
      const ocrText = ref('内容'.repeat(617))
      const catalogScores = ref('')
      const assistant =
        mode === 'chat'
          ? useProjectAssistantChat({
              assistantMode: ref('read_only'),
              overview: ref(null),
              selectedObject: ref(null),
              scrollToBottom: () => undefined
            })
          : undefined
      if (assistant) {
        assistant.chat.messages.push({ id: 'message-test', role: 'user', content: '测试会话内容' })
      }
      const content = () => {
        if (mode === 'catalog-scores')
          return [
            h(
              'button',
              {
                type: 'button',
                onClick: async () => {
                  try {
                    const result = await fetchMdmCatalogPage('material', {})
                    catalogScores.value = JSON.stringify(
                      result.data.map((record) => record.qualityScore)
                    )
                  } catch {
                    catalogScores.value = '读取失败'
                  }
                }
              },
              '读取目录质量分'
            ),
            h('output', { 'aria-label': '目录质量分' }, catalogScores.value)
          ]
        if (mode === 'ocr')
          return [
            h(
              'button',
              {
                type: 'button',
                onClick: () => {
                  ocrText.value = ''
                }
              },
              '清空识别原文'
            ),
            h(OcrOriginalText, { text: ocrText.value })
          ]
        if (mode === 'configuration') return h(AiConfiguration)
        if (mode === 'payroll') return h(Payroll)
        if (mode === 'finance-workbench') return h(FinanceWorkbench)
        if (mode === 'auto-posting') return h(AutoPosting)
        if (mode === 'opening') return h(OpeningBalance)
        if (mode === 'violation') return h(ViolationStandards)
        if (mode === 'voucher')
          return h(VoucherLines, {
            modelValue: lines,
            subjects: [subject],
            currencies: [],
            auxiliaryTypes: [],
            auxiliaryItems: [],
            readonly: true
          })
        if (mode === 'chat')
          return h(
            'button',
            {
              type: 'button',
              onClick: () => assistant?.exportConversation()
            },
            '导出测试会话'
          )
        return [
          h(
            'button',
            {
              type: 'button',
              onClick: () => void prompt.value?.handleOpen({ mode: 'create' })
            },
            '打开提示词测试'
          ),
          h(AiPromptDialog, { ref: prompt })
        ]
      }
      return () =>
        h(ElConfigProvider, { locale: zhCn }, () =>
          h(
            'main',
            { class: 'art-page-view p-4', style: '--art-full-height: calc(100dvh - 32px)' },
            content()
          )
        )
    }
  })
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', name: 'Fixture', component: { render: () => null } }]
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'explicit-locale-test',
  tenantId: subject.tenantId,
  platformSuper: false
})
useMenuStore(store).setButtonList(
  [
    'Fixture:View',
    'FinancePayroll:View',
    'FinanceOpeningBalance:View',
    'FinanceAutoPosting:View',
    'SmisAntiViolationStandardLibrary:View',
    'AiConfiguration:View'
  ].map((name) => ({ name, path: '', type: 'button', meta: { title: '查看测试数据' } }))
)
initializeTheme()
await router.push('/')
await router.isReady()
app.mount('#app')
