import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElInput,
  ElSelect,
  ElTreeSelect,
  ElCascader,
  ElOption,
  ElPopover,
  ElDialog,
  ElMenu,
  ElMenuItem,
  ElSubMenu,
  ElTree
} from 'element-plus'
import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
import ArtMenuRight from '@/components/core/others/art-menu-right/index.vue'
import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import 'element-plus/theme-chalk/src/index.scss'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
import '@/components/core/layouts/art-menus/art-sidebar-menu/theme.scss'
import '@/components/core/forms/art-tiptap-editor/style.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { render: () => null } }]
})
const app = createApp({
  setup() {
    const settings = useSettingStore()
    settings.setCustomRadius(settings.customRadius)
    const menu = ref<InstanceType<typeof ArtMenuRight>>()
    const dialogOpen = ref(false)
    const selected = ref('')
    const icon = () => h(ArtSvgIcon, { icon: 'ri:fullscreen-line' })
    return () =>
      h('main', { class: 'p-4 space-y-4 text-g-800', style: { maxWidth: '800px' } }, [
        h('h1', { class: 'text-lg font-semibold' }, '全局交互圆角'),
        h('label', { class: 'art-icon-label' }, [
          '系统圆角',
          h(
            'select',
            {
              'aria-label': '系统圆角',
              class: 'min-h-8 rounded-surface border px-2',
              value: settings.customRadius,
              onChange: (event: Event) =>
                settings.setCustomRadius((event.target as HTMLSelectElement).value)
            },
            ['0', '0.25', '0.5', '0.75', '1'].map((value) => h('option', { value }, value))
          )
        ]),
        h('section', { class: 'component-surfaces art-card-xs p-4 space-y-3' }, [
          h('h2', '组件外框与浮层'),
          h(ElInput, { placeholder: '输入内容', 'aria-label': '输入内容' }),
          h('div', { 'data-testid': 'tree-select' }, [
            h(ElTreeSelect, {
              placeholder: '选择上级菜单',
              ariaLabel: '选择上级菜单',
              popperClass: 'radius-preview-tree',
              checkStrictly: true,
              data: [
                { value: 'dashboard', label: '仪表盘' },
                {
                  value: 'components',
                  label: '组件示例',
                  children: [{ value: 'forms', label: '表单示例' }]
                }
              ]
            })
          ]),
          h('div', { 'data-testid': 'cascader' }, [
            h(ElCascader, {
              placeholder: '选择业务分组',
              id: 'radius-business-group',
              popperClass: 'radius-preview-cascader',
              options: [
                {
                  value: 'hr',
                  label: '人事管理',
                  children: [{ value: 'roster', label: '员工花名册' }]
                }
              ]
            })
          ]),
          h('label', { for: 'radius-business-group', class: 'sr-only' }, '业务分组'),
          h(
            ElSelect,
            {
              modelValue: selected.value,
              'onUpdate:modelValue': (value: string) => {
                selected.value = value
              },
              placeholder: '选择状态',
              ariaLabel: '选择状态',
              popperClass: 'radius-preview-select'
            },
            () => [
              h(ElOption, { value: 'enabled', label: '在职' }),
              h(ElOption, { value: 'disabled', label: '离职' })
            ]
          ),
          h('div', { class: 'flex flex-wrap gap-2' }, [
            h(
              ElPopover,
              {
                trigger: 'click',
                popperClass: 'radius-preview-popover',
                content: '浮层外框跟随系统圆角。'
              },
              {
                reference: () => h(ElButton, {}, () => '打开 Popover')
              }
            ),
            h(
              ElButton,
              {
                onClick: () => {
                  dialogOpen.value = true
                }
              },
              () => '打开弹窗'
            )
          ])
        ]),
        h('section', { class: 'art-card-xs p-4 space-y-3' }, [
          h('h2', '工具与表格操作'),
          h('div', { class: 'flex flex-wrap items-center gap-2' }, [
            h(ArtIconButton, { icon: 'ri:fullscreen-line', label: '全屏' }),
            h(ArtIconButton, { icon: 'ri:refresh-line', label: '加载中', loading: true }),
            h(ArtIconButton, { icon: 'ri:delete-bin-line', label: '禁用操作', disabled: true }),
            h(ArtButtonTable, { type: 'view', label: '查看记录' }),
            h(
              ElDropdown,
              { trigger: 'click' },
              {
                default: () => h(ArtIconButton, { icon: 'ri:more-line', label: '更多操作' }),
                dropdown: () =>
                  h(ElDropdownMenu, {}, () => [
                    h(ElDropdownItem, {}, () => '查看详情'),
                    h(ElDropdownItem, { disabled: true }, () => '禁用菜单')
                  ])
              }
            ),
            h(
              'button',
              {
                class: 'art-tiptap-toolbar-button',
                'aria-label': '编辑器工具',
                onClick: () => undefined
              },
              icon()
            ),
            h(ElButton, { circle: true, 'aria-label': '圆形按钮' }, icon),
            h(
              ElButton,
              { onClick: (event: MouseEvent) => menu.value?.show(event) },
              () => '右键菜单'
            )
          ])
        ]),
        h('section', { class: 'art-card-xs p-4 space-y-3' }, [
          h('h2', '导航与树'),
          h('div', { class: 'layout-sidebar', style: { width: '230px', maxWidth: '100%' } }, [
            h(
              ElMenu,
              {
                class: 'el-menu-dark',
                defaultActive: 'selected',
                style: { width: '100%', background: 'var(--sidebar-dark-surface)' }
              },
              () => [
                h(ElMenuItem, { index: 'selected' }, () => '当前菜单'),
                h(ElMenuItem, { index: 'normal' }, () => '悬停菜单'),
                h(
                  ElSubMenu,
                  { index: 'group' },
                  {
                    title: () => '业务目录',
                    default: () => h(ElMenuItem, { index: 'child' }, () => '子菜单')
                  }
                )
              ]
            )
          ]),
          h(ElTree, { data: [{ id: 1, label: '组织导航' }], nodeKey: 'id', highlightCurrent: true })
        ]),
        h(
          ElDialog,
          {
            modelValue: dialogOpen.value,
            'onUpdate:modelValue': (value: boolean) => {
              dialogOpen.value = value
            },
            title: '组件圆角',
            width: 'min(480px, calc(100vw - 32px))'
          },
          () => '弹窗边框也使用全局配置。'
        ),
        h(ArtMenuRight, {
          ref: menu,
          menuItems: [
            { key: 'view', label: '查看记录', icon: 'ri:eye-line' },
            { key: 'group', label: '子菜单目录', children: [{ key: 'child', label: '子菜单操作' }] }
          ]
        })
      ])
  }
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'radius-preview',
  tenantId: 'preview',
  platformSuper: true
})
await router.isReady()
app.mount('#app')
