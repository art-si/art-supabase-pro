import { createApp, h, ref } from 'vue'
import { useAmapGeocoder } from '@/hooks/core/useAmapGeocoder'
import { useAmapDrivingEstimate } from '@/hooks/core/useAmapDrivingEstimate'
import { useAmapSdk } from '@/hooks/core/useAmapSdk'

createApp({
  setup() {
    const { geocodeAddress } = useAmapGeocoder()
    const { estimateDrivingRoute } = useAmapDrivingEstimate()
    const { loadAmap } = useAmapSdk({ key: 'synthetic-sdk-test-key', plugins: ['AMap.Geocoder'] })
    const sdk = new URLSearchParams(location.search).get('mode') === 'sdk'
    const driving = new URLSearchParams(location.search).get('mode') === 'driving'
    const result = ref('尚未解析')
    const loading = ref(false)
    async function locate(): Promise<void> {
      loading.value = true
      try {
        if (sdk) {
          await loadAmap()
          result.value = '地图服务已就绪'
        } else if (driving) {
          const estimate = await estimateDrivingRoute(
            { longitude: 120, latitude: 30 },
            { longitude: 121, latitude: 31 }
          )
          result.value = `${estimate.distanceKm},${estimate.estimatedMinutes}`
        } else {
          const location = await geocodeAddress('测试地址')
          result.value = location ? `${location.longitude},${location.latitude}` : '未找到地址'
        }
      } catch (error) {
        result.value = error instanceof Error ? error.message : '地址解析失败，请重试'
      } finally {
        loading.value = false
      }
    }
    return () =>
      h('main', [
        h(
          'button',
          { type: 'button', disabled: loading.value, onClick: locate },
          sdk ? '加载地图' : driving ? '估算路线' : '解析地址'
        ),
        h('output', { 'data-testid': 'result' }, result.value)
      ])
  }
}).mount('#app')
