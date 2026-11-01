import { createApp, defineAsyncComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import type { Component } from 'vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
const params = new URLSearchParams(location.search)
const entry = params.get('entry') || 'production'
const loaders: Record<string, () => Promise<{ default: Component }>> = {
  production: () => import('@mdm/views/production/modules/production-tree.vue'),
  catalog: () => import('@mdm/views/components/catalog/modules/catalog-source-navigator.vue'),
  component: () => import('@mdm/views/engineering/component-type/index.vue'),
  bom: () => import('@mdm/views/engineering/bom-structure/index.vue'),
  accessory: () => import('@mdm/views/engineering/accessory-processing/index.vue'),
  route: () => import('@mdm/views/process-master/process-route/modules/steps-dialog.vue'),
  bin: () => import('@mdm/views/inventory-master/bin/index.vue'),
  'bin-3d': () => import('@mdm/views/inventory-master/bin-3d/index.vue'),
  holiday: () => import('@mdm/views/production/statutory-holiday/index.vue')
}
const Current = defineAsyncComponent(loaders[entry])
const app = createApp({
  setup() {
    const selected = ref('')
    const target = ref<{ handleOpen: (data: object, readonly: boolean) => Promise<void> }>()
    const props =
      entry === 'production'
        ? {
            departments: Array.from({ length: 36 }, (_, index) => ({
              id: `department-${index}`,
              tenantId,
              parentId: null,
              name: `验收生产组织 ${String(index + 1).padStart(2, '0')}`,
              code: `D${index + 1}`,
              organizationId: null,
              kind: '车间',
              factory: '',
              sort: index,
              textColor: '',
              tagType: 'primary',
              enabled: true,
              remark: ''
            })),
            loading: false,
            error: ''
          }
        : entry === 'catalog'
          ? {
              sources: Array.from({ length: 36 }, (_, index) => ({
                type: `source-${index}`,
                label: `验收主档分类 ${String(index + 1).padStart(2, '0')}`,
                app: 'mdm',
                kind: 'master'
              }))
            }
          : {}
    return () =>
      h(ElConfigProvider, { locale: zhCn }, () =>
        h(
          'main',
          {
            class: 'art-full-height',
            style: {
              height: '100vh',
              '--art-full-height': 'calc(100vh - 32px)',
              padding: '16px',
              boxSizing: 'border-box',
              ...(entry === 'production' || entry === 'catalog'
                ? { width: 'min(100%, 380px)' }
                : {})
            }
          },
          [
            entry === 'route' &&
              h(
                ElButton,
                {
                  disabled: !target.value,
                  onClick: () =>
                    target.value?.handleOpen(
                      {
                        id: 'route-test',
                        tenantId,
                        code: 'R01',
                        name: '验收工艺路线',
                        enabled: true,
                        material: { materialName: '验收路线产品' }
                      },
                      true
                    )
                },
                () => '打开工序维护'
              ),
            h(Current, {
              ...props,
              ref: target,
              selected: selected.value,
              onSelect: (value: string | undefined) => {
                selected.value = value || ''
              }
            })
          ]
        )
      )
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
const user = useUserStore(store)
user.setUserInfo({ userId: 'mdm-scroll-test', tenantId, platformSuper: true } as Api.Auth.UserInfo)
const scope = useTenantScopeStore(store)
scope.tenantOptions = [{ id: tenantId, tenantCode: 'TEST', tenantName: '验收租户' }]
scope.scopeOwnerUserId = 'mdm-scroll-test'
scope.setTenantScope(tenantId)
user.setDictMap({
  commonBoolean: [
    { label: '是', value: 'true' },
    { label: '否', value: 'false' }
  ],
  mdmProcessRouteSequenceType: [
    { label: '标准序列', value: 'main' },
    { label: '并行序列', value: 'parallel' }
  ]
})
useTheme().switchThemeStyles(
  params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
)
await router.push('/')
await router.isReady()
app.mount('#app')
