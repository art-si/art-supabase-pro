import { createApp, defineComponent, h, onMounted, ref, shallowRef, type ShallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
import {
  useWarehouseBinOptions,
  useWarehouseRowBinLoader
} from '@/hooks/core/useWarehouseBinOptions'
import language from '@/locales'
import { store } from '@/store'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const visible = ref(true)
const reads = ref(0)
const completed = ref(0)
const retainedOptions = shallowRef<ShallowRef<string[]>>()
let retainedLoad: () => Promise<void> = async () => {}
const perRow = new URLSearchParams(location.search).get('mode') === 'row'

async function fetchBins(): Promise<string[]> {
  reads.value++
  try {
    const response = await fetch('/warehouse-bin-options-test')
    if (!response.ok) throw new Error('synthetic warehouse failure')
    return response.json()
  } finally {
    completed.value++
  }
}

const BinSelector = defineComponent({
  setup() {
    const line = { warehouseId: 'warehouse-a' }
    let options: ShallowRef<string[]>
    if (perRow) {
      options = shallowRef<string[]>([])
      const load = useWarehouseRowBinLoader(
        () => [line],
        () => 1,
        (row) => row.warehouseId,
        fetchBins,
        (_, bins) => {
          options.value = bins
        }
      )
      retainedLoad = () => load(line)
    } else {
      const loader = useWarehouseBinOptions(() => [line], fetchBins)
      options = loader.options
      retainedLoad = () => loader.load(line)
    }
    retainedOptions.value = options
    const model = ref({ bin: '' })
    onMounted(() => void retainedLoad())
    return () => {
      const items: FormItem[] = [
        {
          key: 'bin',
          label: '仓位',
          type: 'select',
          options: options.value.map((value) => ({ label: value, value }))
        }
      ]
      return h(ArtForm, {
        modelValue: model.value,
        'onUpdate:modelValue': (value) => Object.assign(model.value, value),
        items,
        span: 24
      })
    }
  }
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  render: () =>
    h('main', { class: 'mx-auto max-w-xl p-6' }, [
      h('h1', { class: 'mb-4 text-lg font-semibold' }, '仓位选择'),
      h('div', { class: 'mb-4 flex flex-wrap gap-2' }, [
        h('button', { type: 'button', onClick: () => (visible.value = false) }, '隐藏选择器'),
        h('button', { type: 'button', onClick: () => void retainedLoad() }, '重新加载仓位')
      ]),
      visible.value ? h(BinSelector) : h('p', '仓位选择器已卸载'),
      h('output', { 'data-testid': 'bin-options' }, retainedOptions.value?.value.join(',') ?? ''),
      h('output', { 'data-testid': 'reads' }, String(reads.value)),
      h('output', { 'data-testid': 'completed' }, String(completed.value))
    ])
})
app.use(store)
app.use(router)
app.use(language)
await router.isReady()
app.mount('#app')
