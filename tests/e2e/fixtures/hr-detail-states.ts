import { createApp, h, onMounted, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Benefits from '../../../modules/art-supabase-hr/src/views/operations/benefits/modules/benefit-detail-drawer.vue'
import Compliance from '../../../modules/art-supabase-hr/src/views/personnel/compliance/modules/compliance-detail-drawer.vue'
import Relations from '../../../modules/art-supabase-hr/src/views/operations/employee-relations/modules/employee-relation-detail-drawer.vue'
import Experience from '../../../modules/art-supabase-hr/src/views/operations/employee-experience/modules/experience-detail-drawer.vue'
import Service from '../../../modules/art-supabase-hr/src/views/operations/self-service/modules/service-request-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const feature = new URLSearchParams(location.search).get('feature')
const entity = new URLSearchParams(location.search).get('entity')
const app = createApp({
  setup() {
    const benefits = shallowRef<InstanceType<typeof Benefits>>()
    const compliance = shallowRef<InstanceType<typeof Compliance>>()
    const relations = shallowRef<InstanceType<typeof Relations>>()
    const experience = shallowRef<InstanceType<typeof Experience>>()
    const service = shallowRef<InstanceType<typeof Service>>()
    const open = (id: string) => {
      if (feature === 'benefits')
        void benefits.value?.handleOpen(
          entity === 'enrollment' || entity === 'event' ? entity : 'plan',
          id
        )
      else if (feature === 'compliance')
        void compliance.value?.handleOpen(entity === 'qualification' ? entity : 'contract', id)
      else if (feature === 'relations') void relations.value?.handleOpen(id)
      else if (feature === 'service') void service.value?.handleOpen(id)
      else
        void experience.value?.handleOpen(
          entity === 'survey' || entity === 'insight' || entity === 'action' ? entity : 'my',
          id
        )
    }
    onMounted(() => open('first-record'))
    return () => [
      h(
        'button',
        {
          style: { position: 'fixed', top: '4px', left: '4px', zIndex: 10000 },
          onClick: () => open('second-record')
        },
        '切换测试记录'
      ),
      feature === 'benefits'
        ? h(Benefits, { ref: benefits })
        : feature === 'compliance'
          ? h(Compliance, { ref: compliance })
          : feature === 'relations'
            ? h(Relations, { ref: relations })
            : feature === 'service'
              ? h(Service, { ref: service })
              : h(Experience, { ref: experience })
    ]
  }
})
app.use(store)
app.use(language)
setupGlobDirectives(app)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
useUserStore(store).setUserInfo({
  userId: 'detail-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#hr-detail-states')
