import { createApp, h, ref, shallowRef, unref, watch } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import {
  readPlatformTenantScopeActive,
  writePlatformTenantScopeActive,
  writeTenantScopeId
} from '@/utils/tenant-scope-context'
import ArtExcelExport from '@/components/core/forms/art-excel-export/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

type Row = { name: string }
interface ExportHandle {
  isExporting: boolean
}
const mode = new URLSearchParams(location.search).get('mode')
const rows = ref<Row[]>([{ name: 'A-1' }, { name: 'A-2' }])
const filename = ref('snapshot-A')
const progress = ref<number[]>([])
const success = ref<Array<{ filename: string; rowCount: number }>>([])
const errors = ref<Array<{ code: string; message: string }>>([])
const currentExport = shallowRef<ExportHandle>()
const heldExport = shallowRef<ExportHandle>()
watch(
  currentExport,
  (instance) => {
    if (instance) heldExport.value = instance
  },
  { flush: 'sync' }
)
const user = useUserStore(store)
const tenantId = '11111111-1111-4111-8111-111111111111'
user.setUserInfo({ userId: 'user-A', tenantId, platformSuper: false })
user.setLoginStatus(true)
writeTenantScopeId(null)
writePlatformTenantScopeActive(false)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/',
      component: {
        setup() {
          const onProgress = (value: number) => {
            progress.value.push(value)
            if (value === 10 && mode === 'replace-props') {
              rows.value = Array.from({ length: 5 }, (_, index) => ({ name: `B-${index + 1}` }))
              filename.value = 'snapshot-B'
            }
            if (value === 10 && mode === 'mutate-rows') {
              rows.value[0]!.name = 'changed-after-click'
              rows.value.push({ name: 'late-after-click' })
            }
            if (value === 95 && mode === 'change-user') {
              user.setUserInfo({ userId: 'user-B', tenantId, platformSuper: false })
            }
          }
          return () =>
            h(ArtExcelExport, {
              ref: currentExport,
              data: rows.value,
              filename: filename.value,
              columns: { name: { title: '名称' } },
              buttonText: '导出测试表',
              onExportProgress: onProgress,
              onExportSuccess: (value: string, rowCount: number) =>
                success.value.push({ filename: value, rowCount }),
              onExportError: (error: { code: string; message: string }) =>
                errors.value.push({ code: error.code, message: error.message })
            })
        }
      }
    },
    { path: '/other', component: { render: () => h('p', '已离开导出页面') } }
  ]
})

const app = createApp({
  setup() {
    return () =>
      h('main', [
        h('button', { type: 'button', onClick: () => void router.push('/other') }, '切换路由'),
        h(
          'output',
          { id: 'excel-export-state' },
          JSON.stringify({
            route: router.currentRoute.value.path,
            userId: user.getUserInfo.userId,
            tenantId: user.getUserInfo.tenantId,
            platformActive: readPlatformTenantScopeActive(),
            filename: filename.value,
            rowCount: rows.value.length,
            progress: progress.value,
            success: success.value,
            errors: errors.value,
            exporting: unref(heldExport.value?.isExporting) ?? null
          })
        ),
        h(RouterView)
      ])
  }
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
app.mount('#excel-export-snapshot-continuation')
