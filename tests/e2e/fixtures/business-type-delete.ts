import { createApp, h, onMounted, onUnmounted, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import BusinessTypePage from '../../../modules/art-supabase-mdm/src/views/business-type/index.vue'
import DocumentTypePage from '../../../modules/art-supabase-mdm/src/views/document-type/index.vue'
import GlobalReferenceFeedback from '@/components/business/master-data-delete-guard/global-reference-feedback.vue'
import { mittBus } from '@/utils/sys'
import { useSupabase } from '@/hooks/core/useSupabase'
import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
import type { DeleteReferenceContext } from '@/utils/supabase/delete-reference'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/wms/outbound-business/outbound-request', name: 'WmsIssueRequest', component: {} },
    { path: '/scm/purchase/order', name: 'ScmPurchaseOrder', component: {} },
    { path: '/:pathMatch(.*)*', name: 'MdmBusinessType', component: {} }
  ]
})
const app = createApp({
  setup() {
    const { supabase, responseHandle } = useSupabase()
    const triggerGlobalDelete = async () => {
      try {
        await responseHandle(() => supabase.from('mdm_business_type').delete().eq('id', '1'), {
          breakReturn: true,
          showErrorMessage: false
        })
      } catch (error) {
        notifyFriendlyError(error, '模拟删除失败，请重试')
      }
    }
    const referenceContext = shallowRef<DeleteReferenceContext>()
    const showReferences = (context: DeleteReferenceContext) => {
      referenceContext.value = context
    }
    onMounted(() => mittBus.on('deleteReferenceBlocked', showReferences))
    onUnmounted(() => mittBus.off('deleteReferenceBlocked', showReferences))
    return () =>
      h('main', { class: 'art-page-view', style: { height: '100vh', overflow: 'auto' } }, [
        new URLSearchParams(location.search).has('global')
          ? h('button', { type: 'button', onClick: triggerGlobalDelete }, '验证全局引用反馈')
          : h(
              new URLSearchParams(location.search).get('page') === 'document'
                ? DocumentTypePage
                : BusinessTypePage
            ),
        referenceContext.value
          ? h(GlobalReferenceFeedback, { context: referenceContext.value })
          : null,
        h(
          'output',
          { 'data-testid': 'navigation-path', hidden: true },
          router.currentRoute.value.path
        ),
        h(
          'output',
          { 'data-testid': 'navigation', hidden: true },
          JSON.stringify(router.currentRoute.value.query)
        )
      ])
  }
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'permission-test-user',
  tenantId: 'permission-test-tenant',
  platformSuper: true
})
document.addEventListener('revoke-business-type-delete', () => {
  const user = useUserStore(store)
  user.setUserInfo({ ...user.getUserInfo, platformSuper: false })
  useMenuStore(store).setButtonList([
    {
      name: 'MdmBusinessType:View',
      path: 'MdmBusinessType:View',
      type: 'button',
      meta: { title: '查看业务类型' }
    }
  ])
})
document.addEventListener('revoke-document-type-delete', () => {
  const user = useUserStore(store)
  user.setUserInfo({ ...user.getUserInfo, platformSuper: false })
  useMenuStore(store).setButtonList([
    {
      name: 'MdmDocumentType:View',
      path: 'MdmDocumentType:View',
      type: 'button',
      meta: { title: '查看单据类型' }
    }
  ])
})
await router.isReady()
app.mount('#business-type-delete')
