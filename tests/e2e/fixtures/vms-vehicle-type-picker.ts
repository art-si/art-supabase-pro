import { createApp, h, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import { useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import language from '@/locales'
import VehicleTypePicker from '@vms/views/vehicle-archive-edit/modules/vehicle-type-picker.vue'
import VehicleTypeProfilePicker from '@/components/business/vehicle-type-profile-picker/index.vue'
import type { VehicleTypeProfileOption } from '@/components/business/vehicle-type-profile-picker/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '22222222-2222-4222-8222-222222222222'
const darkTheme = new URLSearchParams(location.search).get('theme') === 'dark'
const reactivityMode = new URLSearchParams(location.search).get('mode') === 'reactivity'
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'vehicle-picker-test-user',
  tenantId,
  platformSuper: true,
  nickName: '车型参选验收用户'
})
userStore.setLoginStatus(true)
userStore.setDictMap({
  vehicleTypeCategory: ['半挂车', '按载重', '厢式车', '自卸车', '牵引车', '冷藏车', '其他'].map(
    (label, sort) => ({ label, value: label, code: label, status: '1', sort })
  )
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/vms/vehicle-archive-edit', component: { render: () => h('div') } }]
})
const app = createApp({
  setup() {
    const picker = ref<InstanceType<typeof VehicleTypePicker>>()
    const selected = ref('未选择')
    const directSelection = ref<string | null>(null)
    const directProfiles = ref<VehicleTypeProfileOption[]>([
      { id: 'p-b', category: '__proto__', lengthM: 15, volumeM3: null, loadTons: 30, sort: 10 },
      { id: 'p-a', category: '__proto__', lengthM: 13, volumeM3: 68, loadTons: 28, sort: 10 },
      { id: 'p-z', category: '__proto__', lengthM: 8, volumeM3: 40, loadTons: 20, sort: 5 },
      { id: 'p-t', category: 'toString', lengthM: 20, volumeM3: 75, loadTons: 35, sort: 1 }
    ])
    const { switchThemeStyles } = useTheme()
    onMounted(() => {
      if (darkTheme) switchThemeStyles(SystemThemeEnum.DARK)
    })
    if (reactivityMode)
      return () =>
        h('main', { class: 'art-page-view min-h-screen p-4' }, [
          h('div', { class: 'flex gap-2' }, [
            h(
              'button',
              {
                type: 'button',
                onClick: () => {
                  directProfiles.value = [
                    ...directProfiles.value,
                    {
                      id: 'p-c',
                      category: '__proto__',
                      lengthM: 12,
                      volumeM3: 55,
                      loadTons: 25,
                      sort: 7
                    }
                  ]
                }
              },
              '替换规格输入数组'
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: () =>
                  directProfiles.value.push({
                    id: 'p-d',
                    category: '__proto__',
                    lengthM: 6,
                    volumeM3: 25,
                    loadTons: 15,
                    sort: 3
                  })
              },
              '原数组追加规格'
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: () => {
                  const row = directProfiles.value.find((profile) => profile.id === 'p-b')
                  if (row) row.sort = 0
                }
              },
              '调整规格排序'
            )
          ]),
          h(
            'output',
            { 'aria-label': '输入规格顺序' },
            directProfiles.value.map((profile) => profile.id).join(',')
          ),
          h('output', { 'aria-label': '当前所选规格' }, directSelection.value ?? '未选择'),
          h(VehicleTypeProfilePicker, {
            profiles: directProfiles.value,
            categories: ['__proto__', 'toString'],
            modelValue: directSelection.value,
            'onUpdate:modelValue': (id: string | null) => {
              directSelection.value = id
            }
          })
        ])
    return () =>
      h('main', { class: 'art-page-view min-h-screen p-4' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () => void picker.value?.handleOpen({ tenantId })
          },
          '打开车型参选'
        ),
        h('output', { 'aria-label': '已确认车型' }, selected.value),
        h(VehicleTypePicker, {
          ref: picker,
          onSelected: (profile: { id: string }) => {
            selected.value = profile.id
          }
        })
      ])
  }
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push('/vms/vehicle-archive-edit')
await router.isReady()
app.mount('#vms-vehicle-type-picker')
