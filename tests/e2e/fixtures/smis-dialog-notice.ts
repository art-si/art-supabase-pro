import { createApp, h, nextTick, onMounted, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import AutoConfirmDialog from '../../../modules/art-supabase-smis/src/views/safety-production/protective-equipment-management/ppe-personal-requisition/modules/auto-confirm-setting-dialog.vue'
import ToolReturnDialog from '../../../modules/art-supabase-smis/src/views/safety-production/tool-requisition/tool-requisition-return/modules/tool-return-dialog.vue'
import type AutoConfirmDialogComponent from '../../../modules/art-supabase-smis/src/views/safety-production/protective-equipment-management/ppe-personal-requisition/modules/auto-confirm-setting-dialog.vue'
import type ToolReturnDialogComponent from '../../../modules/art-supabase-smis/src/views/safety-production/tool-requisition/tool-requisition-return/modules/tool-return-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const feature = new URLSearchParams(location.search).get('feature') ?? 'auto-confirm'
const app = createApp({
  setup() {
    const autoConfirm = shallowRef<InstanceType<typeof AutoConfirmDialogComponent>>()
    const toolReturn = shallowRef<InstanceType<typeof ToolReturnDialogComponent>>()
    onMounted(async () => {
      await nextTick()
      if (feature === 'tool-return') await toolReturn.value?.handleOpen({ mode: 'add' })
      else await autoConfirm.value?.handleOpen()
    })
    return () =>
      feature === 'tool-return'
        ? h(ToolReturnDialog, { ref: toolReturn })
        : h(AutoConfirmDialog, { ref: autoConfirm })
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'smis-notice-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
app.mount('#smis-dialog-notice')
