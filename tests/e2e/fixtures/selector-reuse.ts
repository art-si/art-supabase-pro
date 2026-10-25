import { createApp, h, ref, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import ArtMaterialSelect from '@/components/business/art-material-select/index.vue'
import SafetyInspectionDialog from '@smis/views/dual-control-system/risk-control/safety-inspection/modules/safety-inspection-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const inspection = shallowRef<InstanceType<typeof SafetyInspectionDialog>>()
    const material = ref<string>()
    return () =>
      h('main', { class: 'p-4 space-y-4' }, [
        h(
          'button',
          {
            onClick: () => inspection.value?.handleOpen({ inspectionTypes: [], organizations: [] })
          },
          '打开安全检查'
        ),
        h(SafetyInspectionDialog, { ref: inspection }),
        h(ArtMaterialSelect, {
          modelValue: material.value,
          title: '选择零号物料',
          apiFn: () => ({
            data: [{ id: '0', materialCode: 'MAT-0', materialName: '零号物料' }],
            total: 1
          }),
          'onUpdate:modelValue': (value: string | undefined) => (material.value = value)
        }),
        h('output', { 'data-testid': 'material-key' }, material.value ?? '未选择')
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'selector-reuse-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
app.mount('#selector-reuse')
