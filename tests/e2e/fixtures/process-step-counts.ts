import { createApp, h, ref } from 'vue'
import language from '@/locales'
import { fetchMovementTypeOptions } from '../../../modules/art-supabase-mdm/src/api/modules/movement-type'
import { store } from '@/store'
import {
  fetchBomGroups,
  fetchBomProcessRouteSteps,
  fetchBomProcessRoutes
} from '../../../modules/art-supabase-mdm/src/api/modules/bom'
import {
  fetchProcessSteps,
  fetchProcessRoutePath,
  fetchAllProcessRouteSteps
} from '../../../modules/art-supabase-mdm/src/api/modules/workspaces'

const result = ref('尚未查询')
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          onClick: async () => {
            try {
              if (new URLSearchParams(location.search).get('mode') === 'movement-options') {
                const rows = await fetchMovementTypeOptions('tenant-a')
                result.value = JSON.stringify({ data: rows, total: rows.length })
                return
              }
              if (new URLSearchParams(location.search).get('mode') === 'route-path') {
                result.value = await fetchProcessRoutePath('route-a', 'tenant-a')
                return
              }
              if (new URLSearchParams(location.search).get('mode') === 'bom-groups') {
                const rows = await fetchBomGroups('tenant-a')
                result.value = JSON.stringify({ data: rows, total: rows.length })
                return
              }
              if (new URLSearchParams(location.search).get('mode') === 'bom-routes') {
                const rows = await fetchBomProcessRoutes('tenant-a', 'material-a')
                result.value = JSON.stringify({ data: rows, total: rows.length })
                return
              }
              if (new URLSearchParams(location.search).get('mode') === 'bom') {
                const rows = await fetchBomProcessRouteSteps('tenant-a', 'route-a')
                result.value = JSON.stringify({ data: rows, total: rows.length })
                return
              }
              if (new URLSearchParams(location.search).get('mode') === 'complete') {
                const rows = await fetchAllProcessRouteSteps('tenant-a', 'route-a')
                result.value = JSON.stringify({ data: rows, total: rows.length })
                return
              }
              result.value = JSON.stringify(
                await fetchProcessSteps({
                  tenantId: '',
                  current: 1,
                  size: 1000,
                  includeComponentAssignmentCounts:
                    new URLSearchParams(location.search).get('mode') !== 'plain'
                })
              )
            } catch {
              result.value = '查询失败'
            }
          }
        },
        '查询工序'
      ),
      h('output', { 'data-testid': 'step-result' }, result.value)
    ])
})
app.use(store)
app.use(language)
app.mount('#step-counts-preview')
