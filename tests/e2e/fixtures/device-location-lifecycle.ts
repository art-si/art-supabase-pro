import { createApp, h, reactive, ref } from 'vue'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { createRouter, createMemoryHistory } from 'vue-router'
import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
import type { ArtAddressPickerExpose } from '@/components/core/forms/art-address-picker/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const surface = new URLSearchParams(location.search).get('surface')
    const overlay = ref<ArtDialogExpose<{ id: string }>>()
    const picker = ref<ArtAddressPickerExpose>()
    const mounted = ref(true)
    const values = reactive({
      address: '',
      longitude: null as number | string | null,
      latitude: null as number | string | null,
      status: 'pending',
      successes: 0,
      failures: 0,
      completedWaiters: 0
    })
    const reset = () => {
      Object.assign(values, {
        address: '',
        longitude: null,
        latitude: null,
        status: 'pending',
        successes: 0,
        failures: 0
      })
    }
    async function open(id = 'A') {
      reset()
      await overlay.value?.handleOpen(
        { id },
        { title: `定位表单-${id}`, showConfirmButton: false, onReset: reset }
      )
    }
    const fields = () =>
      h('section', { class: 'p-4' }, [
        h('div', { class: 'mb-4 flex flex-wrap gap-4' }, [
          h('button', { onClick: () => void open('B') }, '切换记录'),
          h('button', { onClick: () => overlay.value?.handleReset() }, '重置表单'),
          h(
            'button',
            {
              onClick: () => {
                mounted.value = false
              }
            },
            '卸载地址组件'
          ),
          h(
            'button',
            {
              onClick: async () => {
                await picker.value?.locateCurrent({ silent: true })
                values.completedWaiters += 1
              }
            },
            '静默定位'
          )
        ]),
        mounted.value
          ? h(ArtAddressPicker, {
              ref: picker,
              amapKey: 'synthetic-test-key',
              hideRegionSelector: true,
              showLocateButton: true,
              addressDetail: values.address,
              'onUpdate:addressDetail': (value: string) => {
                values.address = value
              },
              longitude: values.longitude,
              'onUpdate:longitude': (value: number | string | null) => {
                values.longitude = value
              },
              latitude: values.latitude,
              'onUpdate:latitude': (value: number | string | null) => {
                values.latitude = value
              },
              coordinateStatus: values.status,
              'onUpdate:coordinateStatus': (value: string) => {
                values.status = value
              },
              onLocateSuccess: () => values.successes++,
              onLocateError: () => values.failures++
            })
          : null
      ])
    return () =>
      h('main', { class: 'min-h-screen p-4' }, [
        h('button', { onClick: () => void open() }, '打开定位表单'),
        surface === 'inline'
          ? fields()
          : surface === 'drawer'
            ? h(ArtDrawer, { ref: overlay }, { default: fields })
            : h(ArtDialog, { ref: overlay }, { default: fields }),
        h('output', { 'data-testid': 'form-state', hidden: true }, JSON.stringify(values))
      ])
  }
})
  .use(store)
  .use(language)
  .use(
    createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => null } }]
    })
  )

setupGlobDirectives(app)
app.mount('#app')
