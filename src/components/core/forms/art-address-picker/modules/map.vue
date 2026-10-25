<template>
  <div class="art-address-map">
    <div ref="mapRef" class="art-address-map__canvas"></div>

    <section v-if="showPoiSearch" class="art-address-map__panel art-card-xs">
      <div class="art-address-map__search">
        <ElInput
          v-model.trim="innerSearchKeyword"
          placeholder="搜索地点、园区、道路、仓库名称"
          clearable
          @input="handleSearchInput"
          @clear="handleSearchClear"
        >
          <template #prefix>
            <ElIcon><Search /></ElIcon>
          </template>
        </ElInput>
      </div>

      <div class="art-address-map__poi-list">
        <ElScrollbar class="art-address-map__poi-scroll" height="100%">
          <button
            v-for="poi in poiList"
            :key="poi.id || `${poi.name}-${poi.address}`"
            type="button"
            class="art-address-map__poi"
            :class="{ 'is-active': selectedPoi?.id === poi.id }"
            @click="selectPoi(poi)"
          >
            <ElIcon class="art-address-map__poi-icon"><LocationFilled /></ElIcon>
            <span class="art-address-map__poi-main">
              <strong>{{ poi.name }}</strong>
              <small>{{ getPoiDisplayText(poi) }}</small>
            </span>
          </button>
          <ArtEmptyState
            v-if="!poiList.length"
            title="暂无搜索结果"
            description="尝试输入更完整的地址或更换关键词。"
            :visual-size="82"
            size="compact"
          />
        </ElScrollbar>
      </div>
    </section>

    <div v-if="displayMessage" class="art-address-map__message">
      {{ displayMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { LocationFilled, Search } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  import { debounce, trim } from 'lodash-es'
  import { normalizeCoordinatePair } from '@/utils/geo'
  import { normalizeAmapCoordinate } from '@/utils/amap'
  import { useAmapSdk, type AmapBrowserNamespace } from '@/hooks/core/useAmapSdk'
  import { stripRegionPrefix } from '../address'
  import type { AddressMapPickResult } from '../types'

  defineOptions({ name: 'ArtAddressMap' })

  type DistrictLevel = 'province' | 'city' | 'district'

  interface Props {
    amapKey?: string
    amapSecurityJsCode?: string
    plugins?: string[]
    showPoiSearch?: boolean
    enableMapPick?: boolean
    searchKeyword?: string
    searchScope?: string
    cityLimit?: boolean
    regionPath?: string[]
    regionAdcode?: string | null
    regionSearchText?: string
    districtLevel?: DistrictLevel
    fallbackAddress?: string
    message?: string
  }

  interface InitOptions {
    center: [number, number]
    zoom?: number
  }

  interface AMapLngLatLike {
    lng?: number
    lat?: number
    getLng?: () => number
    getLat?: () => number
  }

  interface AMapPoi {
    id?: string
    name: string
    address?: string
    district?: string
    pname?: string
    cityname?: string
    adname?: string
    adcode?: string
    location?: AMapLngLatLike
  }

  interface AMapErrorLike {
    info?: unknown
    message?: unknown
  }

  interface AMapAddressComponent {
    province?: unknown
    city?: unknown
    district?: unknown
    adcode?: string
  }

  interface AMapReverseGeocodeResult extends AMapErrorLike {
    regeocode?: {
      addressComponent?: AMapAddressComponent
      formattedAddress?: string
    }
  }

  interface AMapGeocodeItem {
    location?: AMapLngLatLike
    province?: unknown
    city?: unknown
    district?: unknown
    adcode?: string
  }

  interface AMapGeocodeResult extends AMapErrorLike {
    geocodes?: AMapGeocodeItem[]
  }

  interface AMapAutoCompleteResult extends AMapErrorLike {
    tips?: Partial<AMapPoi>[]
  }

  interface AMapPlaceSearchResult extends AMapErrorLike {
    poiList?: {
      pois?: Partial<AMapPoi>[]
    }
  }

  interface AMapDistrictSearchResult extends AMapErrorLike {
    districtList?: Array<{
      center?: AMapLngLatLike
    }>
  }

  interface AMapMarkerInstance {
    setPosition: (position: [number, number]) => void
  }

  interface AMapMarkerOptions {
    position: [number, number]
    anchor?: 'bottom-center'
    content?: HTMLElement
  }

  interface AMapMapInstance {
    add: (marker: AMapMarkerInstance) => void
    addControl: (control: unknown) => void
    destroy?: () => void
    on: (event: 'click', handler: (event: { lnglat: { lng: number; lat: number } }) => void) => void
    resize?: () => void
    setCenter: (center: [number, number]) => void
    setZoomAndCenter?: (zoom: number, center: [number, number]) => void
  }

  interface AMapCityScopedService {
    setCity?: (city: string) => void
  }

  interface AMapPlaceSearchInstance extends AMapCityScopedService {
    search: (
      keyword: string,
      callback: (status: string, result: AMapPlaceSearchResult) => void
    ) => void
  }

  interface AMapAutoCompleteInstance extends AMapCityScopedService {
    search: (
      keyword: string,
      callback: (status: string, result: AMapAutoCompleteResult) => void
    ) => void
  }

  interface AMapGeocoderInstance extends AMapCityScopedService {
    getAddress: (
      location: [number, number],
      callback: (status: string, result: AMapReverseGeocodeResult) => void
    ) => void
    getLocation: (
      address: string,
      callback: (status: string, result: AMapGeocodeResult) => void
    ) => void
  }

  interface AMapDistrictSearchInstance {
    search: (
      keyword: string,
      callback: (status: string, result: AMapDistrictSearchResult) => void
    ) => void
    setLevel?: (level: DistrictLevel) => void
  }

  interface AMapConstructor extends AmapBrowserNamespace {
    AutoComplete: new (options: Record<string, unknown>) => AMapAutoCompleteInstance
    DistrictSearch: new (options: Record<string, unknown>) => AMapDistrictSearchInstance
    Geocoder: new (options: Record<string, unknown>) => AMapGeocoderInstance
    Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMapInstance
    Marker: new (options: AMapMarkerOptions) => AMapMarkerInstance
    PlaceSearch: new (options: Record<string, unknown>) => AMapPlaceSearchInstance
    Scale: new () => unknown
    ToolBar: new (options: Record<string, unknown>) => unknown
  }

  const props = withDefaults(defineProps<Props>(), {
    amapKey: '',
    amapSecurityJsCode: '',
    plugins: () => [
      'AMap.AutoComplete',
      'AMap.PlaceSearch',
      'AMap.DistrictSearch',
      'AMap.Geocoder',
      'AMap.ToolBar',
      'AMap.Scale'
    ],
    showPoiSearch: false,
    enableMapPick: false,
    searchKeyword: '',
    searchScope: '全国',
    cityLimit: false,
    regionPath: () => [],
    regionAdcode: undefined,
    regionSearchText: '',
    districtLevel: 'province',
    fallbackAddress: '',
    message: ''
  })

  const emit = defineEmits<{
    (event: 'map-click', payload: { lng: number; lat: number }): void
    (event: 'location-pick', payload: AddressMapPickResult): void
    (event: 'error', message: string): void
    (event: 'update:searchKeyword', value: string): void
  }>()

  const mapRef = ref<HTMLDivElement>()
  const innerSearchKeyword = ref('')
  const poiList = ref<AMapPoi[]>([])
  const selectedPoi = ref<AMapPoi>()
  const poiLoading = ref(false)
  const mapMessage = ref('')

  const displayMessage = computed(() => props.message || mapMessage.value)

  let amapInstance: AMapMapInstance | undefined
  let amapNamespace: AMapConstructor | undefined
  let markerInstance: AMapMarkerInstance | undefined
  let placeSearchInstance: AMapPlaceSearchInstance | undefined
  let autoCompleteInstance: AMapAutoCompleteInstance | undefined
  let geocoderInstance: AMapGeocoderInstance | undefined
  let districtSearchInstance: AMapDistrictSearchInstance | undefined
  let searchSequence = 0
  let mapVersion = 0
  let pickSequence = 0
  let centerSequence = 0

  const amapKey = computed(() => props.amapKey || import.meta.env.VITE_AMAP_KEY || '')

  const amapSecurityJsCode = computed(
    () => props.amapSecurityJsCode || import.meta.env.VITE_AMAP_SECURITY_JS_CODE || ''
  )
  const { loadAmap } = useAmapSdk<AMapConstructor>({
    key: amapKey,
    plugins: () => props.plugins,
    securityJsCode: amapSecurityJsCode
  })

  const getAmapErrorMessage = (result: AMapErrorLike | undefined, fallback: string): string => {
    const info = String(result?.info ?? result?.message ?? '')
    if (info === 'INVALID_USER_DOMAIN') return '地图服务未授权当前站点，请联系管理员检查配置。'
    if (info) console.warn('[ArtAddressMap] 地图服务响应异常:', info)
    return fallback
  }

  const normalizeCityName = (value: unknown): string => {
    if (Array.isArray(value)) return String(value[0] ?? '')
    return String(value ?? '')
  }

  const normalizeRegionPath = (params: {
    province?: unknown
    city?: unknown
    district?: unknown
  }): string[] =>
    [
      String(params.province ?? ''),
      normalizeCityName(params.city),
      String(params.district ?? '')
    ].filter(Boolean)

  const getPoiDistrict = (poi: Partial<AMapPoi>): string =>
    trim(String(poi.district || poi.adname || ''))

  const getPoiDisplayText = (poi: AMapPoi): string =>
    trim([getPoiDistrict(poi), poi.address].filter(Boolean).join(' '))

  const getPoiAddress = (poi: AMapPoi): string =>
    trim([poi.name, poi.address].filter(Boolean).join(' '))

  const getPoiLocation = (poi: AMapPoi): { lng: number; lat: number } | undefined => {
    const location = poi.location
    if (!location) return undefined
    const pair = normalizeAmapCoordinate(location)
    return pair ? { lng: pair.longitude, lat: pair.latitude } : undefined
  }

  const normalizePoi = (poi: Partial<AMapPoi>): AMapPoi | undefined => {
    if (!poi.name) return undefined
    const district = getPoiDistrict(poi)
    const adcode = trim(String(poi.adcode || ''))
    if (!district && !adcode) return undefined
    return {
      id: poi.id,
      name: poi.name,
      address: poi.address,
      district,
      pname: poi.pname,
      cityname: poi.cityname,
      adname: poi.adname,
      adcode: poi.adcode,
      location: poi.location
    }
  }

  const createSelectedPoi = (params: AddressMapPickResult): AMapPoi => ({
    id: `map-click-${params.longitude}-${params.latitude}`,
    name: stripRegionPrefix(params.address, params.regionPath ?? []),
    address: params.address,
    district: params.regionPath?.at(-1),
    adcode: params.regionAdcode,
    location: {
      lng: Number(params.longitude),
      lat: Number(params.latitude)
    }
  })

  const syncSearchKeyword = (value: string): void => {
    innerSearchKeyword.value = value
    emit('update:searchKeyword', value)
  }

  const emitPick = (payload: AddressMapPickResult, poi?: AMapPoi): void => {
    searchSequence += 1
    debouncedPoiSearch.cancel()
    poiLoading.value = false
    const nextPoi = poi ?? createSelectedPoi(payload)
    selectedPoi.value = nextPoi
    poiList.value = props.showPoiSearch ? (poi ? poiList.value : [nextPoi]) : []
    syncSearchKeyword(payload.address)
    setMarker(payload.longitude, payload.latitude)
    emit('location-pick', payload)
  }

  const setPickedLocation = (payload: AddressMapPickResult): void => {
    pickSequence += 1
    searchSequence += 1
    debouncedPoiSearch.cancel()
    poiLoading.value = false
    const nextPoi = createSelectedPoi(payload)
    selectedPoi.value = nextPoi
    poiList.value = props.showPoiSearch ? [nextPoi] : []
    syncSearchKeyword(payload.address)
    setMarker(payload.longitude, payload.latitude)
  }

  const updateSearchScope = (): void => {
    placeSearchInstance?.setCity?.(props.searchScope)
    autoCompleteInstance?.setCity?.(props.searchScope)
    geocoderInstance?.setCity?.(props.searchScope)
  }

  const initializeServices = (AMap: AMapConstructor): void => {
    placeSearchInstance = new AMap.PlaceSearch({
      city: props.searchScope,
      citylimit: props.cityLimit,
      pageSize: 12,
      pageIndex: 1
    })
    autoCompleteInstance = new AMap.AutoComplete({
      city: props.searchScope,
      citylimit: props.cityLimit
    })
    geocoderInstance = new AMap.Geocoder({ city: props.searchScope })
    districtSearchInstance = new AMap.DistrictSearch({
      subdistrict: 0,
      extensions: 'all',
      level: props.districtLevel
    })
  }

  const reverseGeocode = (lng: number, lat: number): void => {
    const request = ++pickSequence
    const version = mapVersion
    if (!geocoderInstance) {
      emitPick({
        address: props.fallbackAddress || `${lng}, ${lat}`,
        longitude: lng,
        latitude: lat,
        regionPath: props.regionPath,
        regionAdcode: props.regionAdcode ?? undefined
      })
      return
    }

    geocoderInstance.getAddress([lng, lat], (status: string, result) => {
      if (version !== mapVersion || request !== pickSequence) return
      if (status !== 'complete' && result?.info) {
        const message = getAmapErrorMessage(result, '地点信息读取失败，请重新选点')
        ElMessage.warning(message)
      }

      const component = result?.regeocode?.addressComponent
      const nextAddress =
        status === 'complete'
          ? (result?.regeocode?.formattedAddress ?? `${lng}, ${lat}`)
          : `${lng}, ${lat}`
      const nextRegionPath = normalizeRegionPath({
        province: component?.province,
        city: component?.city,
        district: component?.district
      })

      emitPick({
        address: nextAddress,
        longitude: lng,
        latitude: lat,
        regionPath: nextRegionPath,
        regionAdcode: component?.adcode
      })
    })
  }

  const searchPoi = (options: { silent?: boolean; fallbackKeyword?: string } = {}): void => {
    const currentSequence = ++searchSequence
    const keyword = trim(innerSearchKeyword.value || options.fallbackKeyword || '')
    if (!keyword) {
      poiList.value = []
      if (!options.silent) ElMessage.warning('请输入搜索关键词')
      return
    }
    if (!autoCompleteInstance && !placeSearchInstance) {
      if (options.silent) return
      ElMessage.warning('地图尚未加载完成，请稍后重试')
      return
    }

    poiLoading.value = true
    updateSearchScope()
    autoCompleteInstance?.search(keyword, (autoStatus: string, autoResult) => {
      if (currentSequence !== searchSequence) return
      const tips = ((autoResult?.tips ?? []) as Partial<AMapPoi>[])
        .map(normalizePoi)
        .filter((poi): poi is AMapPoi => Boolean(poi))
      if (autoStatus === 'complete' && tips.length) {
        poiLoading.value = false
        poiList.value = tips.slice(0, 12)
        return
      }

      updateSearchScope()
      placeSearchInstance?.search(keyword, (placeStatus: string, placeResult) => {
        if (currentSequence !== searchSequence) return
        poiLoading.value = false
        if (placeStatus !== 'complete') {
          poiList.value = []
          return
        }
        mapMessage.value = ''
        poiList.value = ((placeResult?.poiList?.pois ?? []) as Partial<AMapPoi>[])
          .map(normalizePoi)
          .filter((poi): poi is AMapPoi => Boolean(poi))
      })
    })
  }

  const debouncedPoiSearch = debounce(() => {
    searchPoi({ silent: true })
  }, 350)

  const handleSearchInput = (): void => {
    searchSequence += 1
    emit('update:searchKeyword', innerSearchKeyword.value)
    selectedPoi.value = undefined
    if (!trim(innerSearchKeyword.value)) {
      debouncedPoiSearch.cancel()
      handleSearchClear()
      return
    }
    debouncedPoiSearch()
  }

  const handleSearchClear = (): void => {
    searchSequence += 1
    debouncedPoiSearch.cancel()
    emit('update:searchKeyword', '')
    poiList.value = []
    poiLoading.value = false
  }

  const geocodePoi = (poi: AMapPoi): void => {
    const request = ++pickSequence
    const version = mapVersion
    const address = getPoiAddress(poi)
    if (!geocoderInstance || !address) return
    geocoderInstance.getLocation(address, (status: string, result) => {
      if (version !== mapVersion || request !== pickSequence) return
      const geocode = result?.geocodes?.[0]
      const location = geocode?.location
      const pair = normalizeAmapCoordinate(location)
      if (status !== 'complete' || !pair) {
        const message = getAmapErrorMessage(result, '地址解析失败，请重新搜索或点击地图选点')
        ElMessage.warning(message)
        return
      }

      emitPick(
        {
          address,
          longitude: pair.longitude,
          latitude: pair.latitude,
          regionPath: normalizeRegionPath({
            province: geocode?.province || poi.pname,
            city: geocode?.city || poi.cityname,
            district: geocode?.district || poi.adname
          }),
          regionAdcode: geocode?.adcode || poi.adcode
        },
        poi
      )
    })
  }

  const selectPoi = (poi: AMapPoi): void => {
    const location = getPoiLocation(poi)
    if (!location) {
      geocodePoi(poi)
      return
    }

    pickSequence += 1
    emitPick(
      {
        address: getPoiAddress(poi),
        longitude: location.lng,
        latitude: location.lat,
        regionPath: normalizeRegionPath({
          province: poi.pname,
          city: poi.cityname,
          district: poi.adname
        }),
        regionAdcode: poi.adcode
      },
      poi
    )
  }

  const centerMapByGeocoder = (region: string, request: number, version: number): void => {
    if (!region || !geocoderInstance) return
    geocoderInstance.getLocation(region, (status: string, result) => {
      if (version !== mapVersion || request !== centerSequence) return
      const location = result?.geocodes?.[0]?.location
      const pair = normalizeAmapCoordinate(location)
      if (status !== 'complete' || !pair) return
      setZoomAndCenter(13, [pair.longitude, pair.latitude])
    })
  }

  const centerByRegion = (): void => {
    const request = ++centerSequence
    const version = mapVersion
    const region = props.regionSearchText
    if (!region) return
    if (districtSearchInstance) {
      districtSearchInstance.setLevel?.(props.districtLevel)
      districtSearchInstance.search(props.regionAdcode || region, (status: string, result) => {
        if (version !== mapVersion || request !== centerSequence) return
        const center = result?.districtList?.[0]?.center
        const pair = normalizeAmapCoordinate(center)
        if (status === 'complete' && pair) {
          setZoomAndCenter(props.districtLevel === 'district' ? 13 : 11, [
            pair.longitude,
            pair.latitude
          ])
          return
        }
        centerMapByGeocoder(region, request, version)
      })
      return
    }
    centerMapByGeocoder(region, request, version)
  }

  const initialize = async (options: InitOptions): Promise<AMapConstructor | undefined> => {
    const version = ++mapVersion
    searchSequence += 1
    pickSequence += 1
    centerSequence += 1
    const element = mapRef.value
    if (!element) return undefined

    const AMap = await loadAmap()
    if (version !== mapVersion || mapRef.value !== element) return undefined
    destroyMap()
    try {
      amapNamespace = AMap
      amapInstance = new AMap.Map(element, {
        zoom: options.zoom ?? 11,
        center: options.center,
        viewMode: '2D',
        mapStyle: 'amap://styles/normal',
        features: ['bg', 'road', 'building', 'point'],
        resizeEnable: true
      })
      amapInstance.addControl(new AMap.Scale())
      amapInstance.addControl(new AMap.ToolBar({ position: 'RT' }))
      amapInstance.on('click', (event: { lnglat: { lng: number; lat: number } }) => {
        if (version !== mapVersion) return
        const pair = normalizeCoordinatePair(event.lnglat.lng, event.lnglat.lat)
        if (!pair) return
        emit('map-click', {
          lng: pair.longitude,
          lat: pair.latitude
        })
        if (props.enableMapPick || props.showPoiSearch) {
          reverseGeocode(pair.longitude, pair.latitude)
        }
      })
      initializeServices(AMap)
      return AMap
    } catch (error) {
      destroy()
      throw error
    }
  }

  const setMarker = (longitude: number | string, latitude: number | string): void => {
    if (!amapInstance || !amapNamespace) return
    const pair = normalizeCoordinatePair(longitude, latitude)
    if (!pair) return
    centerSequence += 1
    const position: [number, number] = [pair.longitude, pair.latitude]
    if (!markerInstance) {
      const markerContent = document.createElement('span')
      markerContent.className = 'art-address-map-marker'
      markerContent.setAttribute('role', 'img')
      markerContent.setAttribute('aria-label', '当前选择位置')
      markerInstance = new amapNamespace.Marker({
        position,
        anchor: 'bottom-center',
        content: markerContent
      })
      amapInstance.add(markerInstance)
    } else {
      markerInstance.setPosition(position)
    }
    amapInstance.setCenter(position)
    resize()
  }

  const setZoomAndCenter = (zoom: number, center: [number, number]): void => {
    amapInstance?.setZoomAndCenter?.(zoom, center)
    resize()
  }

  const resize = (): void => {
    amapInstance?.resize?.()
  }

  const setSearchKeyword = (value: string): void => {
    syncSearchKeyword(value)
  }

  const clearPoi = (): void => {
    searchSequence += 1
    poiList.value = []
    selectedPoi.value = undefined
    poiLoading.value = false
    debouncedPoiSearch.cancel()
  }

  const destroyMap = (): void => {
    amapInstance?.destroy?.()
    amapInstance = undefined
    amapNamespace = undefined
    markerInstance = undefined
  }

  const destroy = (): void => {
    mapVersion += 1
    pickSequence += 1
    centerSequence += 1
    clearPoi()
    destroyMap()
    placeSearchInstance = undefined
    autoCompleteInstance = undefined
    geocoderInstance = undefined
    districtSearchInstance = undefined
    mapMessage.value = ''
  }

  watch(
    () => props.searchKeyword,
    (value) => {
      innerSearchKeyword.value = value
    },
    { immediate: true }
  )

  watch(
    () => [props.searchScope, props.cityLimit],
    () => updateSearchScope()
  )

  onBeforeUnmount(destroy)

  defineExpose({
    initialize,
    setMarker,
    setZoomAndCenter,
    centerByRegion,
    resize,
    searchPoi,
    setSearchKeyword,
    setPickedLocation,
    clearPoi,
    destroy,
    getMap: () => amapInstance,
    getAMap: () => amapNamespace
  })
</script>

<style scoped lang="scss">
  .art-address-map {
    position: relative;
    width: 100%;
    height: 100%;

    &__canvas {
      position: relative;
      z-index: 0;
      width: 100%;
      height: 100%;
    }

    &__panel {
      position: absolute;
      top: 18px;
      left: 18px;
      z-index: 4;
      display: flex;
      flex-direction: column;
      width: min(320px, calc(100% - 36px));
      height: min(420px, calc(100% - 36px));
      max-height: calc(100% - 36px);
      padding: 12px;
      overflow: hidden;
    }

    &__search {
      flex: none;
      margin-bottom: 10px;
    }

    &__poi-list {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    &__poi-scroll {
      height: 100%;
    }

    &__poi {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      width: 100%;
      padding: 10px 8px;
      text-align: left;
      cursor: pointer;
      background: transparent;
      border: 0;
      border-radius: var(--el-border-radius-base);

      &:hover,
      &.is-active {
        background: var(--el-color-primary-light-9);
      }

      &.is-active {
        .art-address-map__poi-icon {
          color: var(--el-color-primary);
        }
      }
    }

    &__poi-icon {
      flex: none;
      width: 22px;
      height: 22px;
      margin-top: 4px;
      font-size: 22px;
      color: var(--el-text-color-placeholder);
    }

    &__poi-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        line-height: 18px;
        color: var(--el-text-color-secondary);
      }
    }

    &__message {
      position: absolute;
      inset: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: var(--el-text-color-secondary);
      pointer-events: none;
      background: var(--el-fill-color-lighter);
    }
  }

  @media (width <= 600px) {
    .art-address-map__panel {
      top: 12px;
      left: 12px;
      width: calc(100% - 24px);
      height: min(260px, 46%);
      max-height: calc(100% - 24px);
      padding: 10px;
    }
  }

  :global(.art-address-map-marker) {
    position: relative;
    display: block;
    width: 34px;
    height: 44px;
    filter: drop-shadow(0 7px 8px rgb(36 33 91 / 26%));
  }

  :global(.art-address-map-marker::before) {
    position: absolute;
    top: 2px;
    left: 4px;
    width: 26px;
    height: 26px;
    content: '';
    background: linear-gradient(135deg, var(--theme-color), var(--el-color-primary-dark-2));
    border: 3px solid var(--el-color-white);
    border-radius: 50% 50% 50% 7px;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-color) 22%, transparent);
    transform: rotate(-45deg);
  }

  :global(.art-address-map-marker::after) {
    position: absolute;
    top: 11px;
    left: 13px;
    width: 8px;
    height: 8px;
    content: '';
    background: var(--el-color-white);
    border-radius: 50%;
    box-shadow: 0 0 0 3px rgb(255 255 255 / 22%);
  }
</style>
