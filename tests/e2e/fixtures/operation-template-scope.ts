import { createApp, h, ref, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import TemplateDialog from '../../../modules/art-supabase-mdm/src/views/production/operation-template/modules/template-dialog.vue'
import { createTemplate } from '../../../modules/art-supabase-mdm/src/views/production/operation-template/modules/template-model'
import type { OperationTemplate } from '../../../modules/art-supabase-mdm/src/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const actorTenant = '11111111-1111-4111-8111-111111111111'
const selectedTenant = '22222222-2222-4222-8222-222222222222'
const rowTenant = '33333333-3333-4333-8333-333333333333'
const dialog = ref<InstanceType<typeof TemplateDialog>>()
const successes = ref(0)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      h(
        'button',
        {
          onClick: async () => {
            const scope = new URLSearchParams(location.search).get('scope')
            useUserStore(store).setUserInfo({
              userId: 'scope-test-user',
              tenantId: actorTenant,
              platformSuper: scope !== 'ordinary'
            })
            useTenantScopeStore(store).selectedTenantId =
              scope === 'selected' ? selectedTenant : null
            await nextTick()
            const row: OperationTemplate = {
              ...createTemplate(rowTenant),
              id: '44444444-4444-4444-8444-444444444444',
              name: '原模板',
              totalScore: 0,
              createBy: '',
              createTime: '',
              updateTime: ''
            }
            void dialog.value?.handleOpen({
              mode: scope === 'edit' ? 'edit' : 'add',
              row: scope === 'edit' ? row : undefined
            })
          }
        },
        '打开模板'
      ),
      h(TemplateDialog, { ref: dialog, onSuccess: () => successes.value++ }),
      h('button', { onClick: () => router.push('/away') }, '离开模板页面'),
      h('output', { 'data-testid': 'success-count' }, String(successes.value))
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
app.mount('#template-preview')
