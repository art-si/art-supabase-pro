import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import type { AppRouteRecord } from '@/types/router'
import type { WmsSalesChoice } from '../../../modules/art-supabase-wms/src/api/initial-sales.types'
import SalesChoicePicker from '../../../modules/art-supabase-wms/src/views/initialization/initial-sales/modules/sales-choice-picker.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const pickerRef = ref<{ open: () => Promise<void> }>()
const selected = ref<WmsSalesChoice[]>([])
const tenantId = '7529f951-938e-4e2c-ac0d-316c136ae1f9'

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view p-4' }, [
      h('button', { type: 'button', onClick: () => void pickerRef.value?.open() }, '打开库存选单'),
      h('p', { id: 'selected-packs' }, selected.value.map((row) => row.packNo).join('、')),
      h(SalesChoicePicker, {
        ref: pickerRef,
        kind: 'stock',
        tenantId,
        organizationId: '8fbc1836-d0ea-4afd-98c6-f557ab40fe4f',
        warehouseId: 'd97f5bc1-73c4-4617-9225-b0af0327875f',
        onConfirm: (rows: WmsSalesChoice[]) => {
          selected.value = rows
        }
      })
    ])
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: {} }]
  })
)
setupGlobDirectives(app)
initializeTheme()
useUserStore(store).setUserInfo({ userId: 'sales-pack-test', tenantId, platformSuper: true })
useMenuStore(store).setButtonList(
  ['WmsSalesOutbound:View'].map<AppRouteRecord>((name) => ({
    name,
    path: '',
    component: '',
    type: 'button',
    meta: { title: name }
  }))
)
app.mount('#sales-pack-picker')
