import { createApp, h, ref } from 'vue'
import { store } from '@/store'
import language from '@/locales'
import {
  fetchWorkflowRoleOptions,
  fetchWorkflowUserOptions,
  fetchWorkflowDelegations
} from '@/api/workflow'

const result = ref('尚未查询')
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          onClick: async () => {
            const response = await (new URLSearchParams(location.search).get('mode') ===
            'delegations'
              ? fetchWorkflowDelegations('user-a')
              : new URLSearchParams(location.search).get('mode') === 'roles'
                ? fetchWorkflowRoleOptions({ tenantId: 'tenant-a' })
                : fetchWorkflowUserOptions({ tenantId: 'tenant-a' }))
            result.value = response.error ? '查询失败' : JSON.stringify(response)
          }
        },
        '查询流程选项'
      ),
      h('output', { 'data-testid': 'option-result' }, result.value)
    ])
})
app.use(store)
app.use(language)
app.mount('#workflow-options')
