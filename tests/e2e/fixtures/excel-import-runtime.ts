import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const contextKey = ref('context-A')
const parsing = ref(false)
const successes = ref<
  Array<{ fileName: string; uploadName: string; rows: Record<string, unknown>[] }>
>([])
const errors = ref<string[]>([])
const app = createApp({
  setup() {
    return () =>
      h('main', { class: 'art-page-view p-4' }, [
        h(
          'button',
          { type: 'button', onClick: () => (contextKey.value = 'context-B') },
          '切换上下文'
        ),
        h(ArtExcelImport, {
          accept: '.csv,.xls,.xlsx',
          contextKey: contextKey.value,
          onImportSuccess: (
            rows: Record<string, unknown>[],
            file: File,
            uploadFile: { name: string }
          ) => successes.value.push({ fileName: file.name, uploadName: uploadFile.name, rows }),
          onImportError: (error: Error) => errors.value.push(error.message),
          onParsingChange: (value: boolean) => (parsing.value = value)
        }),
        h(
          'output',
          { id: 'excel-import-state' },
          JSON.stringify({
            contextKey: contextKey.value,
            parsing: parsing.value,
            successes: successes.value,
            errors: errors.value
          })
        )
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
app.mount('#excel-import-runtime')
