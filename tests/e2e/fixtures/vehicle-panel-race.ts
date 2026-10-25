import { createApp, h, ref } from 'vue'
import { useVehiclePanelList } from '@vms/views/vehicle-query/modules/use-vehicle-panel-list'
import type { VehicleArchive } from '@vms/views/vehicle-query/modules/types'
createApp({
  setup() {
    const vehicle = ref<VehicleArchive>({ id: 'first', plateNo: '同车牌', vehicleType: 'test' })
    let release: ((value: string[]) => void) | undefined
    const { records, loading } = useVehiclePanelList(vehicle, (current) =>
      current.id === 'first'
        ? new Promise<string[]>((resolve) => {
            release = resolve
          })
        : Promise.resolve([current.id || 'empty'])
    )
    return () =>
      h('main', [
        h(
          'button',
          {
            onClick: () => {
              vehicle.value = { ...vehicle.value, id: 'second' }
            }
          },
          '切换同车牌车辆'
        ),
        h('button', { onClick: () => release?.(['过期车辆记录']) }, '释放旧请求'),
        h(
          'button',
          {
            onClick: () => {
              vehicle.value = { ...vehicle.value, plateNo: '' }
            }
          },
          '清空车辆'
        ),
        h('output', records.value.join(',')),
        h('p', loading.value ? '加载中' : '加载结束')
      ])
  }
}).mount('#app')
