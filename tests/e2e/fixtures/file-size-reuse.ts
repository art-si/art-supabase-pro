import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
import { formatSize } from '@/utils/file/format-size'
import WaybillDocumentPanel from '@tms/views/waybill-management/detail/modules/waybill-document-panel.vue'
import CapabilityCenterDrawer from '@/views/data-center/supabase-ai-assistant/modules/capability-center-drawer.vue'
import DocumentsPage from '@smis/views/safety-production/document-center/all-documents/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const capability = ref<InstanceType<typeof CapabilityCenterDrawer>>()
const waybill: Api.Tms.Waybill.WaybillDetailRecord = {
  id: 'test-waybill',
  tenantId: 'test-tenant',
  waybillNo: 'WB-TEST',
  status: 'completed',
  routePoints: [],
  pickupPhotos: [],
  deliveryPhotos: [],
  receiptAttachments: [],
  createTime: '',
  updateTime: '',
  events: [],
  cargoOperations: [],
  costs: [],
  expenseLocations: [],
  proofs: [
    {
      id: 'test-proof',
      waybillId: 'test-waybill',
      proofType: 'receipt',
      fileName: '测试回单.pdf',
      fileUrl: 'https://example.invalid/test.pdf',
      fileSize: 1024 ** 3,
      mimeType: 'application/pdf'
    }
  ]
}
const app = createApp({
  render: () =>
    mode === 'tms'
      ? h('main', { class: 'p-4' }, h(WaybillDocumentPanel, { waybill }))
      : mode === 'capability'
        ? h('main', { class: 'p-4' }, [
            h(
              'button',
              {
                type: 'button',
                onClick: () => capability.value?.handleOpen({ edgeFunctions: null })
              },
              '打开能力中心'
            ),
            h(CapabilityCenterDrawer, { ref: capability })
          ])
        : mode === 'documents'
          ? h('main', { class: 'h-screen p-4' }, h(DocumentsPage))
          : h('main', { class: 'grid min-w-0 gap-4 p-4' }, [
              h('h1', '附件大小与上传限制'),
              h('dl', { class: 'grid grid-cols-2 gap-2' }, [
                h('dt', '空文件'),
                h('dd', formatSize(0)),
                h('dt', '未知大小'),
                h('dd', formatSize(null, { emptyText: '大小未知' })),
                h('dt', '大文件'),
                h('dd', formatSize(1024 ** 3, { precision: 1 }))
              ]),
              h(ArtUploadFile, {
                modelValue: [],
                showResourcePicker: false,
                fileSize: 20 * 1024 ** 2
              }),
              h(ArtUploadFile, { modelValue: [], showResourcePicker: false, fileSize: 1024 ** 3 })
            ])
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'file-size-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList([
  ...['SmisAllDocuments:View', 'SmisAllDocuments:Edit', 'SmisAllDocuments:Follow'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: '测试权限' }
  }))
])
await router.isReady()
app.mount('#app')
