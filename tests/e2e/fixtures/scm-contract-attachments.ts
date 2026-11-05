import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ScmContractAttachments from '../../../modules/art-supabase-scm/src/components/scm-contract-attachments.vue'
import type { ScmContractAttachment } from '@scm/api'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import i18n from '@/locales'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const firstTenant = '11111111-1111-4111-8111-111111111111'
const secondTenant = '33333333-3333-4333-8333-333333333333'
const longName = `${'合同附件名称很长需要保持可读'.repeat(8)}.pdf`

useUserStore(store).setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: firstTenant,
  platformSuper: true,
  userName: 'fixture-user'
} as Api.Auth.UserInfo)

const previewRouter = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})

const Harness = defineComponent({
  setup() {
    const kind = ref<'sales' | 'purchase'>('sales')
    const tenantId = ref(firstTenant)
    const readonly = ref(false)
    const attachments = ref<ScmContractAttachment[]>([])
    const persisted = ref<ScmContractAttachment[]>([])
    const revision = ref(0)
    const pending = ref(false)
    const attachmentRef = ref<InstanceType<typeof ScmContractAttachments> | null>(null)

    return () =>
      h('main', { class: 'mx-auto max-w-5xl p-5', 'data-testid': 'attachment-harness' }, [
        h('div', { class: 'mb-5 flex flex-wrap gap-2' }, [
          h('button', { type: 'button', onClick: () => (kind.value = 'sales') }, '销售合同'),
          h('button', { type: 'button', onClick: () => (kind.value = 'purchase') }, '采购合同'),
          h(
            'button',
            { type: 'button', onClick: () => (readonly.value = !readonly.value) },
            '切换只读'
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                tenantId.value = secondTenant
                attachments.value = []
                revision.value += 1
              }
            },
            '切换租户'
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => (pending.value = attachmentRef.value?.hasPendingUpload() ?? false)
            },
            '读取上传状态'
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                attachments.value = [
                  {
                    name: longName,
                    url: 'https://example.test/contract.pdf',
                    fileType: 'pdf',
                    fileSize: 1024
                  }
                ]
              }
            },
            '注入长文件名'
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                persisted.value = attachments.value.map((item) => ({ ...item }))
                revision.value += 1
                attachments.value = persisted.value.map((item) => ({ ...item }))
              }
            },
            '模拟保存并回显'
          )
        ]),
        h('output', { 'data-testid': 'contract-kind' }, kind.value),
        h('output', { 'data-testid': 'attachment-count' }, String(attachments.value.length)),
        h('output', { 'data-testid': 'pending-upload' }, String(pending.value)),
        h(ScmContractAttachments, {
          key: `${kind.value}-${revision.value}`,
          ref: attachmentRef,
          tenantId: tenantId.value,
          contextKey: `test-${kind.value}-${tenantId.value}`,
          readonly: readonly.value,
          modelValue: attachments.value,
          'onUpdate:modelValue': (value: ScmContractAttachment[]) => (attachments.value = value)
        })
      ])
  }
})

createApp(Harness).use(store).use(previewRouter).use(i18n).mount('#scm-contract-attachments-test')
