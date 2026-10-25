import { createApp, h, nextTick, onMounted, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import OrganizationDialog from '@/views/system/organization/modules/organization-dialog.vue'
import UserRoleDialog from '@/views/system/user/modules/user-role-dialog.vue'
import type OrganizationDialogComponent from '@/views/system/organization/modules/organization-dialog.vue'
import type UserRoleDialogComponent from '@/views/system/user/modules/user-role-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const feature = new URLSearchParams(location.search).get('feature') ?? 'organization'
const tenantId = '11111111-1111-4111-8111-111111111111'
const roleUser: Api.SystemManage.UserListItem = {
  id: 'user-context-test',
  tenantId,
  avatar: null,
  password: '',
  confirmPassword: '',
  userName: 'context-user',
  userGender: 'unknown',
  nickName: '跨区域系统管理员',
  userPhone: '',
  userEmail: 'context.user@example.invalid',
  userRoles: ['role-a', 'role-b']
}

const app = createApp({
  setup() {
    const organization = shallowRef<InstanceType<typeof OrganizationDialogComponent>>()
    const userRole = shallowRef<InstanceType<typeof UserRoleDialogComponent>>()
    onMounted(async () => {
      await nextTick()
      if (feature === 'user-role') await userRole.value?.handleOpen(roleUser)
      else await organization.value?.handleOpen({ type: 'add' })
    })
    return () =>
      feature === 'user-role'
        ? h(UserRoleDialog, { ref: userRole })
        : h(OrganizationDialog, { ref: organization })
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'system-context-test',
  tenantId,
  platformSuper: false
})
app.mount('#system-dialog-context')
