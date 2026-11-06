import {
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  ref,
  shallowRef,
  type Component,
  type ComponentPublicInstance
} from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const feature = params.get('feature') || 'tenant'
const mode = params.get('mode') || 'edit'
const menuMove = params.has('menuMove')
const tenantId = '11111111-1111-4111-8111-111111111111'
const recordId = '22222222-2222-4222-8222-222222222222'
const components: Record<string, () => Promise<{ default: Component }>> = {
  website: () => import('@/views/system/website-config/index.vue'),
  user: () => import('@/views/system/user/modules/user-dialog.vue'),
  tenant: () => import('@/views/system/tenant/modules/tenant-dialog.vue'),
  role: () => import('@/views/system/role/modules/role-edit-dialog.vue'),
  organization: () => import('@/views/system/organization/modules/organization-dialog.vue'),
  menu: () => import('@/views/system/menu/modules/menu-dialog.vue'),
  notification: () =>
    import('@/views/system/notification-reminder/modules/notification-rule-dialog.vue'),
  number: () => import('@/views/system/document-number/modules/document-number-create-dialog.vue'),
  ai: () => import('@/views/system/ai-configuration/modules/ai-feature-config-dialog.vue'),
  param: () => import('@/views/system/system-param/modules/system-param-dialog.vue'),
  geofence: () => import('@/views/system/geofence-config/index.vue'),
  dict: () => import('@/views/data-center/dict/modules/dict-dialog.vue'),
  'dict-type': () => import('@/views/data-center/dict/modules/dict-type-dialog.vue'),
  'user-detail': () => import('@/views/system/user/modules/user-detail-drawer.vue'),
  'menu-detail': () => import('@/views/system/menu/modules/menu-detail-drawer.vue'),
  'ai-run-detail': () => import('@/views/dashboard/ai-operations/modules/ai-run-detail-drawer.vue'),
  'workflow-detail': () =>
    import('@/views/workflow/workbench/modules/workflow-instance-drawer.vue'),
  payable: () =>
    import('@/components/business/payable-reference-workspace/modules/reference-editor.vue'),
  zone: () => import('@mdm/views/inventory-master/zone/index.vue')
}

const user = {
  id: recordId,
  tenantId,
  userName: 'fixture_user',
  nickName: '验收用户',
  userEmail: 'fixture@example.invalid',
  userPhone: '13800138000',
  accountIdentityType: 'external',
  remark: '外部业务协作验收账号',
  userGender: 'unknown',
  userType: '1',
  status: '1',
  password: '',
  confirmPassword: '',
  userRoles: ['业务审核员']
}
const menu = {
  id: recordId,
  name: 'FixtureMenu',
  path: menuMove ? '/legacy/folder' : '/system/fixture',
  component: menuMove ? '/legacy/folder-view' : '/system/fixture',
  type: params.get('menuType') || 'menu',
  ...(menuMove ? { sort: 1 } : {}),
  meta: { title: '验收菜单', isEnable: true, sort: 1 },
  children: []
}
const menuTree = menuMove
  ? [
      menu,
      {
        id: 'target-folder',
        name: 'TargetFolder',
        path: '/target',
        component: '/index/index',
        type: 'folder',
        sort: 2,
        meta: { title: '目标目录', isEnable: true },
        children: []
      }
    ]
  : []
const rows: Record<string, Record<string, unknown>> = {
  user,
  tenant: {
    id: recordId,
    tenantCode: 'fixture_tenant',
    tenantName: '验收租户',
    status: '1',
    serviceStartDate: '2020-01-01',
    serviceEndDate: '2099-12-31',
    remark: '验收用途'
  },
  role: {
    id: recordId,
    tenantId,
    roleName: '验收角色',
    roleCode: 'R_FIXTURE',
    description: '验收职责范围',
    enabled: true
  },
  organization: {
    id: recordId,
    tenantId,
    organizationName: '验收组织',
    organizationCode: 'FIXTURE_ORG',
    organizationType: 'department',
    status: '1',
    sort: 1
  },
  notification: {
    id: recordId,
    tenantId,
    scenarioId: 'fixture-scenario',
    ruleName: '验收提醒',
    leadDays: 30,
    leadMonths: null,
    repeatEveryDays: null,
    sendHour: 9,
    recipientStrategy: 'owner_then_roles',
    recipientRoleCodes: ['fixture_role'],
    channels: ['in_app'],
    enabled: true
  },
  param: {
    id: recordId,
    paramName: '验收参数',
    paramKey: 'fixture.parameter',
    groupCode: 'general',
    groupName: '通用设置',
    paramType: 'single_text',
    paramValue: '验收内容',
    defaultValue: '',
    extendConfig: {},
    enabled: true,
    builtin: false,
    sort: 1,
    remark: ''
  },
  dict: {
    id: recordId,
    typeId: 'fixture-dict-type',
    dictTypeCode: 'fixtureDictionary',
    dictTypeName: '验收字典',
    label: '验收选项',
    code: 'fixture_option',
    value: 'fixture',
    status: '1',
    sort: 1,
    i18nScope: '1',
    tagType: '',
    color: '',
    remark: ''
  },
  'dict-type': {
    id: recordId,
    name: '验收字典类型',
    code: 'fixtureDictionary',
    nodeType: params.get('nodeType') || 'directory',
    parentId: params.get('nodeType') === 'dictionary' ? 'fixture-directory' : null,
    status: '1',
    sort: 1,
    remark: ''
  }
}

function openArguments(): unknown[] {
  const editing = mode === 'edit'
  if (feature === 'role')
    return [{ type: editing ? 'edit' : 'add', roleData: editing ? rows.role : undefined }]
  if (feature === 'organization')
    return [{ type: editing ? 'edit' : 'add', row: editing ? rows.organization : undefined }]
  if (feature === 'menu') return [{ type: menu.type, row: editing ? menu : undefined, menuTree }]
  if (feature === 'ai')
    return [
      {
        editData: {
          id: recordId,
          feature: 'chat',
          enabled: true,
          provider: 'openai',
          model: 'fixture-model',
          visionModel: null,
          fallbackModel: null,
          timeoutMs: 30000,
          maxRetries: 2,
          temperature: 0.5,
          maxTokens: 1000,
          rateLimitPerMinute: 10,
          rateLimitPerDay: 1000,
          promptVersion: 'v1'
        }
      }
    ]
  if (feature === 'user-detail') return [user]
  if (feature === 'menu-detail') return [menu, [menu]]
  if (feature === 'ai-run-detail') return [{ id: recordId }]
  if (feature === 'workflow-detail') return [recordId]
  if (feature === 'payable')
    return [
      mode === 'add'
        ? undefined
        : {
            id: recordId,
            tenantId,
            code: 'QA-SCHEME',
            name: '验收核销方案',
            enabled: true,
            automatic: false,
            rules: [
              {
                primaryField: params.has('invalidRule') ? '' : 'supplier_id',
                secondaryField: 'supplier_id',
                operator: 'eq',
                emptyMatches: false
              }
            ],
            ...(params.has('matrix')
              ? {
                  relationRules: [
                    {
                      relation: 'payable_payment',
                      rules: [
                        {
                          primaryField: 'source_id',
                          secondaryField: 'source_id',
                          operator: 'eq',
                          emptyMatches: false
                        }
                      ]
                    }
                  ]
                }
              : {})
          }
    ]
  if (feature === 'number' || feature === 'geofence') return []
  if (feature === 'dict' && !editing)
    return [
      { typeId: 'fixture-dict-type', dictTypeCode: 'fixtureDictionary', dictTypeName: '验收字典' }
    ]
  return editing ? [rows[feature]] : []
}

const app = createApp(
  defineComponent({
    setup() {
      const component = shallowRef<Component>()
      const instance = shallowRef<ComponentPublicInstance>()
      const success = ref(0)
      const failure = ref('')
      async function open(): Promise<void> {
        const current = instance.value
        const method: unknown = current
          ? Reflect.get(current, feature === 'payable' ? 'open' : 'handleOpen')
          : undefined
        if (typeof method === 'function') await Reflect.apply(method, current, openArguments())
      }
      onMounted(async () => {
        try {
          component.value = (await components[feature]()).default
          await nextTick()
          await open()
        } catch (cause) {
          failure.value = cause instanceof Error ? cause.message : '验收入口未打开'
        }
      })
      return () =>
        h(
          ElConfigProvider,
          { locale: zhCn },
          {
            default: () =>
              h(
                'main',
                {
                  class: 'min-w-0 p-4',
                  style:
                    feature === 'zone' ? { '--art-full-height': 'calc(100dvh - 32px)' } : undefined
                },
                [
                  h('button', { onClick: () => void open() }, '重新打开验收入口'),
                  h('output', { 'aria-label': '保存次数' }, String(success.value)),
                  failure.value ? h('p', { role: 'alert' }, failure.value) : null,
                  component.value
                    ? h(component.value, {
                        ref: instance,
                        ...(feature === 'notification'
                          ? {
                              tenantId,
                              scenarios: [
                                {
                                  id: 'fixture-scenario',
                                  scenarioCode: 'fixture_expiry',
                                  scenarioName: '验收证件到期',
                                  moduleCode: 'vms'
                                }
                              ]
                            }
                          : {}),
                        ...(feature === 'menu' ? { onSubmit: () => success.value++ } : {}),
                        ...(feature === 'payable'
                          ? {
                              kind: params.get('kind') || 'scheme',
                              configurationVersion: 2,
                              relationOptions: [
                                { label: '应付付款核销', value: 'payable_payment' },
                                { label: '应付红蓝对冲', value: 'payable_red_blue' }
                              ]
                            }
                          : {}),
                        onSuccess: () => success.value++
                      })
                    : null
                ]
              )
          }
        )
    }
  })
)
app.use(store)
initializeTheme()
if (params.has('theme'))
  useTheme().switchThemeStyles(
    params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
  )
document.documentElement.dataset.boxMode =
  params.get('theme') === 'dark'
    ? 'shadow-mode'
    : useSettingStore(store).boxBorderMode
      ? 'border-mode'
      : 'shadow-mode'
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
const userStore = useUserStore(store)
userStore.setUserInfo({ userId: 'form-standard-test', tenantId, platformSuper: true })
const tenantScope = useTenantScopeStore(store)
tenantScope.selectedTenantId = tenantId
await userStore.fetchDictList()
app.mount('#form-standard-main')
