import { createApp, h, ref } from 'vue'
import { store } from '@/store'
import { fetchWmsInventoryOrganizationOptions } from '@/api/wms-inventory-organization'
import { fetchWmsInitializationStatusPage } from '@/api/wms-purchase'
import { fetchWmsInventoryOrganizations } from '../../../modules/art-supabase-wms/src/api/initialization'
const output = ref('未加载')
const mode = new URLSearchParams(location.search).get('mode')
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          onClick: async () => {
            try {
              if (mode === 'invalid' || mode === 'invalid-wms') {
                if (mode === 'invalid-wms')
                  await fetchWmsInventoryOrganizations({ current: 0, size: 50 })
                else await fetchWmsInitializationStatusPage({ current: 0, size: 50 })
                output.value = '错误接受了非法分页'
              } else if (mode === 'page' || mode === 'initialization-status') {
                const result =
                  mode === 'initialization-status'
                    ? await fetchWmsInitializationStatusPage({
                        tenantId: 'tenant-a',
                        keyword: '测试',
                        status: 'initialized',
                        current: 40,
                        size: 50
                      })
                    : await fetchWmsInventoryOrganizations({
                        tenantId: 'tenant-a',
                        organizationType: 'company',
                        keyword: '测试',
                        enabled: 'enabled',
                        current: 40,
                        size: 50
                      })
                output.value = JSON.stringify({
                  total: result.total,
                  length: result.data.length,
                  first: result.data[0]?.id,
                  last: result.data.at(-1)
                })
              } else {
                const rows = await fetchWmsInventoryOrganizationOptions(
                  'tenant-a',
                  'company',
                  '测试'
                )
                output.value = JSON.stringify({
                  total: rows.length,
                  first: rows[0],
                  last: rows.at(-1)
                })
              }
            } catch (error) {
              output.value =
                (mode === 'invalid' || mode === 'invalid-wms') && error instanceof RangeError
                  ? '分页参数无效'
                  : '加载失败'
            }
          }
        },
        '读取组织'
      ),
      h('output', { 'data-testid': 'result' }, output.value)
    ])
})
app.use(store)
app.mount('#inventory-organizations')
