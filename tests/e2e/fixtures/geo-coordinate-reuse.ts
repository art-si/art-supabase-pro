import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import i18n from '@/locales'
import { setupGlobDirectives } from '@/directives'
import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
import Geofence from '@tms/views/basic-data/customer-address/modules/address-geofence-dialog.vue'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
const mode = params.get('mode') ?? 'valid'
const longitude =
  mode === 'missing'
    ? null
    : mode === 'masked'
      ? '***'
      : mode === 'blank'
        ? ' '
        : mode === 'invalid'
          ? 'invalid'
          : mode === 'range'
            ? 181
            : mode === 'zero'
              ? 0
              : 120.123456
const latitude = mode === 'zero' ? 0 : mode === 'latitude' ? 91 : 30.123456
const row: Api.Tms.BasicData.CustomerAddress = {
  id: 'coordinate-address-test',
  customerId: null,
  addressType: 'shipping',
  contactName: '坐标验收联系人',
  contactPhone: '',
  region: '坐标验收地区',
  addressDetail: '坐标验收地址',
  longitude,
  latitude,
  geofenceEnabled: params.has('enabled'),
  geofenceRadiusM: 1000
}
const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof Geofence>>()
    const successes = ref(0)
    return () =>
      h('main', { style: { padding: '16px' } }, [
        h('button', { onClick: () => void dialog.value?.handleOpen(row) }, '打开围栏'),
        h('output', { 'aria-label': '保存成功次数' }, String(successes.value)),
        h(ArtAddressPicker, {
          longitude,
          latitude,
          coordinateStatus: params.get('status') ?? undefined,
          addressDetail: row.addressDetail,
          hideRegionSelector: true,
          regionOptions: [{ name: '坐标验收地区' }]
        }),
        h(Geofence, { ref: dialog, onSuccess: () => successes.value++ })
      ])
  }
})
app.use(store)
app.use(i18n)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => h('div') } }]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'geo-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  params.has('denied') ? [] : [{ path: '', name: 'TmsCustomerAddress:Geofence', type: 'button' }]
)
app.mount('#app')
