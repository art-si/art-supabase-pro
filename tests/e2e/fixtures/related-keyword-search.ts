import { createApp, h, ref } from 'vue'
import { store } from '@/store'
import { fetchWmsSalesReturnAllocationPage } from '../../../modules/art-supabase-wms/src/api/warehouse'
import { fetchBoms } from '../../../modules/art-supabase-mdm/src/api/modules/bom'
import {
  fetchExecutionTasks,
  fetchProductionReports,
  fetchExecutionEvents
} from '../../../modules/art-supabase-mes/src/api/execution'

const mode = new URLSearchParams(location.search).get('mode')
const output = ref('未加载')
const query = {
  current: 21,
  size: 50,
  tenantId: 'tenant-a',
  keyword: '测试,(材料)',
  statuses: ['unreported', 'reported']
}
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          onClick: async () => {
            try {
              const result =
                mode === 'bom'
                  ? await fetchBoms(query)
                  : mode === 'report'
                    ? await fetchProductionReports(query)
                    : mode === 'event'
                      ? await fetchExecutionEvents(query)
                      : mode === 'sales-return'
                        ? await fetchWmsSalesReturnAllocationPage(query)
                        : await fetchExecutionTasks(query)
              output.value = `${result.total}:${result.data.length}:${result.data[0]?.id}`
            } catch {
              output.value = '加载失败'
            }
          }
        },
        '搜索'
      ),
      h('output', { 'data-testid': 'result' }, output.value)
    ])
})
app.use(store)
app.mount('#related-keyword-search')
