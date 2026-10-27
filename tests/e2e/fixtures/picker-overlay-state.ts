import { createApp, h, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import ArtResourcePicker from '@/components/core/forms/art-resource-picker/index.vue'
import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
import ArtDataSelect from '@/components/core/forms/art-data-select/index.vue'
import type { ArtDataSelectExpose } from '@/components/core/forms/art-data-select/types'
import ArtIconPicker from '@/components/core/forms/art-icon-picker/index.vue'
import WorkflowCatalog from '@/views/workflow/definition/modules/workflow-business-catalog-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const app = createApp({
  setup() {
    const visible = ref(false)
    const address = ref<InstanceType<typeof ArtAddressPicker>>()
    const dataSelect = ref<ArtDataSelectExpose>()
    const catalog = ref<InstanceType<typeof WorkflowCatalog>>()
    const iconPicker = ref<InstanceType<typeof ArtIconPicker>>()
    const compact = mode === 'compact'
    const rows = Array.from({ length: compact ? 3 : 48 }, (_, index) => ({
      id: `pack-${index + 1}`,
      name: `PK-${String(index + 1).padStart(4, '0')}`,
      area: 'A区'
    }))
    useEventListener(window, 'keydown', (event) => {
      if (event.key === 'F8') visible.value = false
    })
    return () =>
      h('main', { class: 'art-page-view min-h-screen p-4' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              mode === 'address'
                ? address.value?.openPicker()
                : mode === 'catalog'
                  ? catalog.value?.handleOpen()
                  : mode === 'icon'
                    ? iconPicker.value?.handleOpen()
                    : mode === 'data' || mode === 'compact' || mode === 'tree'
                      ? dataSelect.value?.open()
                      : (visible.value = true)
          },
          '打开选择器'
        ),
        mode === 'catalog'
          ? h(WorkflowCatalog, { ref: catalog, menuTree: [] })
          : mode === 'icon'
            ? h(ArtIconPicker, { ref: iconPicker })
            : mode === 'data' || mode === 'compact' || mode === 'tree'
              ? h(ArtDataSelect, {
                  ref: dataSelect,
                  title: '全屏高度验证选单',
                  subtitle: '选择包号并确认',
                  mode: mode === 'tree' ? 'tree' : 'table',
                  multiple: !compact,
                  labelKey: 'name',
                  data: rows,
                  showPagination: !compact && mode !== 'tree',
                  showSelectedPanel: !compact,
                  columns: [
                    { prop: 'name', label: '包号', minWidth: 180 },
                    { prop: 'area', label: '区域', minWidth: 120 }
                  ],
                  navigation: compact
                    ? undefined
                    : {
                        title: '生产工单',
                        data: [{ id: 'order-1', name: 'MO-TEST-001' }],
                        labelKey: 'name'
                      }
                })
              : mode === 'address'
                ? h(ArtAddressPicker, {
                    ref: address,
                    amapKey: 'sdk-test-key',
                    hideRegionSelector: true
                  })
                : h(ArtResourcePicker, {
                    visible: visible.value,
                    'onUpdate:visible': (value: boolean) => {
                      visible.value = value
                    }
                  }),
        h('output', { 'aria-label': '外部显示状态' }, String(visible.value))
      ])
  }
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: {} }]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'picker-state-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
app.mount('#picker-overlay-state')
