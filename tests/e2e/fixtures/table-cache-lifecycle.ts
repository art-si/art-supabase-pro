import { createApp, defineComponent, h, ref } from 'vue'
import { useTable } from '@/hooks/core/useTable'
import { store } from '@/store'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const requests = ref(0)
const TableConsumer = defineComponent({
  setup() {
    const table = useTable({
      core: {
        apiFn: async () => {
          requests.value++
          return { records: [{ id: requests.value }], total: 1, current: 1, size: 10 }
        }
      },
      performance: {
        enableCache: !new URLSearchParams(location.search).has('no-cache'),
        cacheTime: 2000
      }
    })
    return () =>
      h('section', [
        h('button', { type: 'button', onClick: () => table.fetchData() }, '读取当前页'),
        h('output', { 'aria-label': '缓存条数' }, String(table.cacheInfo.value.total)),
        h('output', { 'aria-label': '数据条数' }, String(table.data.value.length))
      ])
  }
})
createApp({
  setup() {
    const mounted = ref(true)
    return () =>
      h('main', { class: 'p-4' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              mounted.value = !mounted.value
            }
          },
          '切换表格'
        ),
        h('output', { 'aria-label': '请求次数' }, String(requests.value)),
        mounted.value ? h(TableConsumer) : null
      ])
  }
})
  .use(store)
  .mount('#app')
