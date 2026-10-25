import { createApp, h, ref } from 'vue'
import { store } from '@/store'
import { fetchWmsPurchaseOrderTargets } from '@/api/wms-purchase'
import { fetchCargoMaterialOptions } from '../../../modules/art-supabase-tms/src/api/modules/cargo'
import {
  fetchWmsAssemblyChildCandidates,
  fetchWmsPackOptions,
  fetchWmsShippingNotices
} from '../../../modules/art-supabase-wms/src/api/warehouse'
import { fetchStationOptions } from '../../../modules/art-supabase-tms/src/api/modules/station'
import { fetchDriverAssignedVehicles } from '../../../modules/art-supabase-tms/src/api/modules/driver'
import { fetchInsuranceCompanyOptions } from '../../../modules/art-supabase-vms/src/api/providers/supabase/vehicle/archive'
import {
  fetchAccessoryLists,
  fetchAccessoryProjects,
  fetchAccessoryCustomers
} from '../../../modules/art-supabase-mdm/src/api/modules/accessory-processing'

const output = ref('未加载')
const mode = new URLSearchParams(location.search).get('mode')
let requestController: AbortController | undefined
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          onClick: async () => {
            try {
              if (mode === 'accessory-project' || mode === 'accessory-customer') {
                const rows =
                  mode === 'accessory-project'
                    ? await fetchAccessoryProjects('tenant-a')
                    : await fetchAccessoryCustomers('tenant-a')
                output.value = `${rows.length}:${rows.at(-1)?.id}`
                return
              }
              if (mode === 'driver' || mode === 'insurance') {
                const result =
                  mode === 'insurance'
                    ? await fetchInsuranceCompanyOptions()
                    : await fetchDriverAssignedVehicles({
                        driverId: '11111111-1111-4111-8111-111111111111',
                        carrierId: 'carrier-a'
                      })
                if (result.error) throw result.error
                const rows = result.data ?? []
                output.value = `${rows.length}:${rows.at(-1)?.id}`
                return
              }
              if (mode === 'station') {
                requestController = new AbortController()
                const result = await fetchStationOptions(
                  {
                    tenantId: 'tenant-a',
                    stationType: 'transfer',
                    keyword: '测试'
                  },
                  { signal: requestController.signal }
                )
                if (result.error) throw result.error
                const rows = result.data ?? []
                output.value = `${rows.length}:${rows.at(-1)?.id}`
                return
              }
              const rows =
                mode === 'cargo'
                  ? await fetchCargoMaterialOptions('tenant-a')
                  : mode === 'purchase'
                    ? await fetchWmsPurchaseOrderTargets('tenant-a')
                    : mode === 'pack'
                      ? await fetchWmsPackOptions('order-a')
                      : mode === 'notice'
                        ? await fetchWmsShippingNotices('tenant-a')
                        : mode === 'accessory'
                          ? await fetchAccessoryLists('tenant-a')
                          : await fetchWmsAssemblyChildCandidates('order-a')
              output.value = `${rows.length}:${rows.at(-1)?.id}`
            } catch {
              output.value = '加载失败'
            }
          }
        },
        '加载候选'
      ),
      h('button', { onClick: () => requestController?.abort() }, '取消加载'),
      h('output', { 'data-testid': 'result' }, output.value)
    ])
})
app.use(store)
app.mount('#options-pagination')
