import { createApp, h, ref } from 'vue'
import ArtMenuRight from '@/components/core/others/art-menu-right/index.vue'
import 'element-plus/theme-chalk/src/index.scss'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

createApp({
  setup() {
    const menu = ref<InstanceType<typeof ArtMenuRight>>()
    const mounted = ref(true)
    const hidden = ref(0)
    const selected = ref(0)
    const items = [
      {
        key: 'group',
        label: '更多操作',
        icon: 'ri:folder-line',
        children: [{ key: 'child', label: '子菜单操作', icon: 'ri:file-line' }]
      },
      { key: 'select', label: '选择操作', icon: 'ri:check-line' },
      { key: 'disabled', label: '不可用操作', icon: 'ri:lock-line', disabled: true }
    ]
    return () =>
      h('main', { class: 'p-4' }, [
        h('button', { onClick: (event: MouseEvent) => menu.value?.show(event) }, '打开菜单'),
        h(
          'button',
          {
            style: { position: 'fixed', bottom: '16px', left: '16px' },
            onClick: () => menu.value?.hide()
          },
          '关闭菜单'
        ),
        h(
          'button',
          {
            style: { position: 'fixed', bottom: '64px', left: '16px' },
            onClick: () => {
              mounted.value = !mounted.value
            }
          },
          '切换组件'
        ),
        h('output', { 'aria-label': '关闭次数' }, String(hidden.value)),
        h('output', { 'aria-label': '选择次数' }, String(selected.value)),
        // 第一个隐藏实例用于验证菜单内部点击不会命中其他实例。
        h(ArtMenuRight, { menuItems: items }),
        mounted.value
          ? h(ArtMenuRight, {
              ref: menu,
              menuItems: items,
              onHide: () => hidden.value++,
              onSelect: () => selected.value++
            })
          : null
      ])
  }
}).mount('#app')
