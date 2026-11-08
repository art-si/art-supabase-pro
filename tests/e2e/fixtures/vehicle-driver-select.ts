import { createApp, h, ref } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
import { vehicleDriverSelectProps } from '@/components/business/vehicle-driver-select/columns'
import { fetchVehicleDriverChoices } from '@/api/vehicle-driver-select'
import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
import { dispatchFixtureDictionaries } from '../support/tms-dispatch-dictionaries'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const user = useUserStore(store)
user.setUserInfo({ userId: 'choice-preview', tenantId: 'choice-tenant', platformSuper: false })
user.setDictMap({
  ...dispatchFixtureDictionaries,
  sex: [{ name: '男', value: 'male', label: '男', code: 'male', status: '1', sort: 0 }],
  tmsDriverLicenseType: [{ name: 'B2', value: 'B2', label: 'B2', code: 'B2', status: '1', sort: 0 }]
})
const entry = {
  setup() {
    const form = ref<Record<string, unknown>>({ vehicleId: undefined, driverIds: [] })
    const items: FormItem[] = [
      {
        label: '车辆',
        key: 'vehicleId',
        type: 'dataSelect',
        props: {
          ...vehicleDriverSelectProps('vehicle'),
          apiFn: (p: DataSelectFetchParams) => fetchVehicleDriverChoices('approved_vehicle', p)
        }
      },
      {
        label: '备用司机',
        key: 'driverIds',
        type: 'dataSelect',
        props: {
          ...vehicleDriverSelectProps('driver'),
          multiple: true,
          apiFn: (p: DataSelectFetchParams) =>
            fetchVehicleDriverChoices('archive_driver', p, {
              tenantId: 'choice-tenant',
              vehicleOwnership: 'self_operated',
              driverType: 'secondary'
            })
        }
      }
    ]
    return () =>
      h('main', { class: 'art-page-view p-6' }, [
        h(ArtForm, {
          modelValue: form.value,
          'onUpdate:modelValue': (value: Record<string, unknown>) => {
            form.value = value
          },
          items,
          span: 12
        }),
        h('output', { 'data-testid': 'selected' }, JSON.stringify(form.value))
      ])
  }
}
const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(entry)) })
app
  .use(store)
  .use(language)
  .use(createRouter({ history: createMemoryHistory(), routes: [] }))
setupGlobDirectives(app)
initializeTheme()
useTheme().switchThemeStyles(
  params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
)
document.documentElement.dataset.boxMode = params.get('box') || 'border-mode'
app.mount('#app')
