import { createApp, h, ref } from 'vue'
import Picker from '@/components/core/forms/art-tiptap-editor/art-tiptap-table-picker.vue'
import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'
const app = createApp({
  setup() {
    const result = ref('未插入')
    return () =>
      h('main', { class: 'p-4' }, [
        h(Picker, {
          onInsert: (value: { rows: number; columns: number; withHeaderRow: boolean }) => {
            result.value = JSON.stringify(value)
          }
        }),
        h('output', result.value)
      ])
  }
})
app.component('ArtSvgIcon', ArtSvgIcon)
app.mount('#app')
import '@/components/core/forms/art-tiptap-editor/style.scss'
