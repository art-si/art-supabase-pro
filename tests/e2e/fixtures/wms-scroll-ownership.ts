import { createApp, h, ref } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import InventoryLocationNavigator from '@wms/views/inventory-trace/shared/inventory-location-navigator.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const warehouses = Array.from({ length: 40 }, (_, index) => ({
  id: `warehouse-${index + 1}`,
  code: `W${String(index + 1).padStart(2, '0')}`,
  name: `验收仓库 ${String(index + 1).padStart(2, '0')}`
}))
const app = createApp({
  setup() {
    const selection = ref<{ key: string; warehouseId?: string }>({ key: 'all' })
    return () =>
      h(ElConfigProvider, { locale: zhCn }, () =>
        h(
          'main',
          { style: { padding: '16px', width: 'min(100%, 380px)', height: 'min(760px, 96vh)' } },
          [
            h(InventoryLocationNavigator, {
              kind: 'stock',
              locations: { warehouses, zones: [], bins: [] },
              navigation: warehouses.map((warehouse) => ({
                warehouseId: warehouse.id,
                zoneId: null,
                binId: null,
                count: 1
              })),
              selection: selection.value,
              loading: false,
              error: false,
              onSelect: (value) => {
                selection.value = value
              }
            })
          ]
        )
      )
  }
})
app.use(store)
const settings = useSettingStore(store)
const theme =
  new URLSearchParams(location.search).get('theme') === 'dark'
    ? SystemThemeEnum.DARK
    : SystemThemeEnum.LIGHT
settings.setGlobalTheme(theme, theme)
initializeTheme()
app.mount('#app')
