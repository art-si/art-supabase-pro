import { createApp, h, ref } from 'vue'
import ArtDragVerify from '@/components/core/forms/art-drag-verify/index.vue'
import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'

const verified = ref(false)
const app = createApp({
  render: () =>
    h('main', { style: { padding: '24px' } }, [
      h('h1', '滑块手势验收'),
      h('div', { 'data-testid': 'outside', style: { height: '80px' } }, '其他可滑动区域'),
      h(ArtDragVerify, {
        value: verified.value,
        width: 280,
        successText: '验证通过',
        'onUpdate:value': (value: boolean) => {
          verified.value = value
        }
      }),
      h('output', verified.value ? '已通过' : '待验证')
    ])
})
app.component('ArtSvgIcon', ArtSvgIcon)
app.mount('#drag-preview')
