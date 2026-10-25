import { createApp, h, ref } from 'vue'
import ArtCutterImg from '@/components/core/media/art-cutter-img/index.vue'
import { setupGlobDirectives } from '@/directives'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.classList.add(
  params.get('box') === 'shadow' ? 'shadow-mode' : 'border-mode'
)

const app = createApp({
  setup() {
    const source = ref('')
    const mounted = ref(true)
    const errors = ref(0)
    const loaded = ref(0)
    return () =>
      h('main', { class: 'p-4' }, [
        params.has('lifecycle')
          ? h('nav', { class: 'flex flex-wrap gap-2' }, [
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => {
                    source.value = '/tests/e2e/fixtures/cutter-held.png'
                  }
                },
                '读取慢图片'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => {
                    source.value = ''
                  }
                },
                '清空图片地址'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => {
                    mounted.value = !mounted.value
                  }
                },
                '切换裁剪组件'
              ),
              h('output', { 'aria-label': '图片错误次数' }, String(errors.value)),
              h('output', { 'aria-label': '裁剪加载次数' }, String(loaded.value))
            ])
          : null,
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              source.value =
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5u0AAAAASUVORK5CYII='
            }
          },
          '设置验收图片'
        ),
        mounted.value
          ? h(ArtCutterImg, {
              imgUrl: source.value,
              isModal: false,
              ...(params.has('defaults')
                ? {}
                : { boxWidth: 220, boxHeight: 180, cutWidth: 200, cutHeight: 160 }),
              title: '图片裁剪',
              previewTitle: '结果预览',
              onError: () => {
                errors.value++
              },
              onImageLoadComplete: () => {
                loaded.value++
              }
            })
          : null
      ])
  }
})
setupGlobDirectives(app)
app.mount('#app')
