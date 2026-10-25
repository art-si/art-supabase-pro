import { createApp, h, ref } from 'vue'
import language from '@/locales'
import { store } from '@/store'
import {
  fetchExecutionTasks,
  fetchExecutionAttendanceRange,
  fetchExecutionShiftNames,
  fetchProductionReportShiftNames
} from '../../../modules/art-supabase-mes/src/api/execution'
import { fetchWorkOrders } from '../../../modules/art-supabase-mes/src/api/manufacturing'

const params = new URLSearchParams(window.location.search)
const result = ref('尚未查询')
let controller: AbortController | undefined
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          onClick: async () => {
            controller = new AbortController()
            try {
              if (params.get('mode') === 'execution-shifts') {
                result.value = JSON.stringify(await fetchExecutionShiftNames(params.get('tenant')))
                return
              }
              if (params.get('mode') === 'report-shifts') {
                result.value = JSON.stringify(
                  await fetchProductionReportShiftNames(params.get('tenant'), [
                    '2026-10-01',
                    '2026-10-02'
                  ])
                )
                return
              }
              result.value = JSON.stringify(
                await (
                  params.get('mode') === 'work-orders'
                    ? fetchWorkOrders
                    : params.get('mode') === 'attendance'
                      ? fetchExecutionAttendanceRange
                      : fetchExecutionTasks
                )(
                  {
                    current: 2,
                    size: 20,
                    tenantId: params.get('tenant'),
                    shiftName: params.get('shift') || undefined,
                    workCenterId: params.get('center') || undefined
                  },
                  { signal: controller.signal }
                )
              )
            } catch {
              result.value = '查询失败'
            }
          }
        },
        '查询测试'
      ),
      h('button', { onClick: () => controller?.abort() }, '取消查询'),
      h('output', { 'data-testid': 'execution-result' }, result.value)
    ])
})
app.use(store)
app.use(language)
app.mount('#execution-query-preview')
