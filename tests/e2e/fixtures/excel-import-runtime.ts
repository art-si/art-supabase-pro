import { createApp, h, KeepAlive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const contextKey = ref('context-A')
const parsing = ref(false)
const parsingChanges = ref<boolean[]>([])
const fileChanges = ref<string[]>([])
const reentryOn = ref<'true' | 'false' | null>(null)
const reentryFired = ref(false)
const inputValueAtReentry = ref<string | null>(null)
const mounted = ref(true)
const activated = ref(true)
const parseExcel = ref(true)
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const userStore = useUserStore(store)
const tenantScope = useTenantScopeStore(store)
userStore.setUserInfo({ userId: 'import-test-user', tenantId: tenantA, platformSuper: true })
tenantScope.scopeOwnerUserId = 'import-test-user'
tenantScope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '测试租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '测试租户 B' }
]
tenantScope.selectedTenantId = tenantA
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/another', component: { template: '<div />' } }
  ]
})
const successes = ref<
  Array<{ fileName: string; uploadName: string; rows: Record<string, unknown>[] }>
>([])
const errors = ref<string[]>([])
const app = createApp({
  setup() {
    return () =>
      h('main', { class: 'art-page-view p-4' }, [
        ...(
          [
            ['切换上下文', () => (contextKey.value = 'context-B')],
            ['切换租户', () => tenantScope.setTenantScope(tenantB)],
            ['更新租户版本', () => (tenantScope.revision += 1)],
            [
              '切换用户',
              () =>
                userStore.setUserInfo({
                  ...userStore.getUserInfo,
                  userId: 'import-test-user-B'
                })
            ],
            [
              '切换认证租户',
              () => userStore.setUserInfo({ ...userStore.getUserInfo, tenantId: tenantB })
            ],
            [
              '撤销平台身份',
              () => userStore.setUserInfo({ ...userStore.getUserInfo, platformSuper: false })
            ],
            ['切换路由', () => void router.push('/another')],
            ['解析开始回入切租户', () => (reentryOn.value = 'true')],
            ['解析结束回入切租户', () => (reentryOn.value = 'false')],
            ['停用组件', () => (activated.value = false)],
            ['卸载组件', () => (mounted.value = false)],
            ['关闭解析', () => (parseExcel.value = false)]
          ] as Array<[string, () => void]>
        ).map(([label, onClick]) => h('button', { type: 'button', onClick }, label)),
        mounted.value
          ? h(KeepAlive, null, [
              activated.value
                ? h(ArtExcelImport, {
                    key: 'import',
                    accept: '.csv,.xls,.xlsx',
                    parseExcel: parseExcel.value,
                    contextKey: contextKey.value,
                    onFileChange: (file: File) => fileChanges.value.push(file.name),
                    onImportSuccess: (
                      rows: Record<string, unknown>[],
                      file: File,
                      uploadFile: { name: string }
                    ) =>
                      successes.value.push({
                        fileName: file.name,
                        uploadName: uploadFile.name,
                        rows
                      }),
                    onImportError: (error: Error) => errors.value.push(error.message),
                    onParsingChange: (value: boolean) => {
                      parsing.value = value
                      parsingChanges.value.push(value)
                      if (reentryOn.value === String(value) && !reentryFired.value) {
                        reentryFired.value = true
                        inputValueAtReentry.value =
                          document.querySelector<HTMLInputElement>('input[type="file"]')?.value ??
                          null
                        tenantScope.setTenantScope(tenantB)
                      }
                    }
                  })
                : h('span', '组件已停用')
            ])
          : h('span', '组件已卸载'),
        h(
          'output',
          { id: 'excel-import-state' },
          JSON.stringify({
            contextKey: contextKey.value,
            parsing: parsing.value,
            parsingChanges: parsingChanges.value,
            fileChanges: fileChanges.value,
            reentryFired: reentryFired.value,
            inputValueAtReentry: inputValueAtReentry.value,
            mounted: mounted.value,
            activated: activated.value,
            route: router.currentRoute.value.fullPath,
            tenantId: tenantScope.effectiveTenantId,
            tenantRevision: tenantScope.revision,
            userId: userStore.getUserInfo.userId,
            actorTenantId: userStore.getUserInfo.tenantId,
            platformSuper: userStore.isPlatformSuper,
            successes: successes.value,
            errors: errors.value
          })
        )
      ])
  }
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
app.mount('#excel-import-runtime')
