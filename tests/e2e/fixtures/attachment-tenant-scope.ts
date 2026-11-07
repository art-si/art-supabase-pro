import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ResourcePanel from '@/components/core/forms/art-resource-picker/panel.vue'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import useResourceStore from '@/store/modules/resource'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const platformTenantId = '55555555-5555-4555-8555-555555555555'
const businessTenantId = '11111111-1111-4111-8111-111111111111'
const readOnlyResources = new URLSearchParams(location.search).get('resources') === 'readonly'
const captureUpload = new URLSearchParams(location.search).get('resources') === 'upload'

if (captureUpload) {
  const resourceStore = useResourceStore(store)
  resourceStore.removeButton('local-file-upload')
  resourceStore.addButton({
    name: 'local-file-upload',
    label: '文件上传',
    icon: 'ri:file-upload-line',
    uploadConfig: { accept: '.pdf', limit: 1 },
    upload: async (files, args) => {
      const selected = Array.isArray(files) ? files : [files]
      document.body.dataset.uploadedNames = selected.map((file) => file.name).join(',')
      document.body.dataset.uploadedTenantId = args.targetTenantId || ''
      await args.handleGetResourceList?.()
    }
  })
}

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: platformTenantId,
  tenant: { tenantCode: 'platform', tenantName: '平台管理员租户', builtinType: 'platform' },
  platformSuper: true
} as Api.Auth.UserInfo)

const tenantScopeStore = useTenantScopeStore(store)
tenantScopeStore.selectedTenantId = null
tenantScopeStore.tenantOptions = [
  {
    id: businessTenantId,
    tenantCode: 'visual-test',
    tenantName: '视觉验收业务租户',
    builtinType: 'business',
    status: '1'
  } as Api.SystemManage.TenantListItem & { id: string }
]

const previewRouter = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})

createApp({
  render: () =>
    h('main', { style: 'height: 780px; padding: 20px' }, [
      h(
        'button',
        {
          type: 'button',
          onClick: () => tenantScopeStore.setTenantScope(businessTenantId)
        },
        '切换业务租户'
      ),
      h(ResourcePanel, {
        showAction: false,
        showPasteUpload: true,
        showRenameAction: true,
        showCopyActions: true,
        pageSize: readOnlyResources ? 1 : 30,
        canUpload: !readOnlyResources,
        canRename: !readOnlyResources,
        canDelete: !readOnlyResources
      })
    ])
})
  .use(store)
  .use(previewRouter)
  .mount('#attachment-preview')
