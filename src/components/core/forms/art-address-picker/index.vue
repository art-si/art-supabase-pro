<template>
  <div class="art-address-picker">
    <ElRow :gutter="gutter">
      <ElCol v-if="!hideRegionSelector" :xs="24" :sm="24" :md="regionSpan">
        <ElFormItem
          ref="regionFormItemRef"
          :label="regionLabel"
          :label-width="labelWidth"
          :prop="regionPathProp"
        >
          <ElCascader
            v-model="regionPath"
            class="art-address-picker__control"
            :options="resolvedRegionOptions"
            :props="mergedCascaderProps"
            :placeholder="regionPlaceholder"
            :clearable="clearable"
            :filterable="filterable"
            :disabled="disabled"
            :loading="regionLoading"
            @change="handleRegionChange"
          >
            <template #empty>
              <ArtPickerEmpty title="暂无可选地区" />
            </template>
          </ElCascader>
        </ElFormItem>
      </ElCol>

      <ElCol :xs="24" :sm="24" :md="resolvedDetailSpan">
        <ElFormItem
          ref="detailFormItemRef"
          :label="detailLabel"
          :label-width="labelWidth"
          :prop="addressDetailProp"
        >
          <div class="art-address-picker__detail">
            <ElInput
              v-model.trim="addressDetail"
              class="art-address-picker__control"
              :maxlength="detailMaxlength"
              :placeholder="detailPlaceholder"
              :disabled="disabled"
              :clearable="clearable"
              show-word-limit
              @focus="openPickerOnFocus && handleOpenPicker()"
              @input="handleDetailChange"
              @clear="handleDetailClear"
            >
              <template #prefix>
                <ElIcon><Location /></ElIcon>
              </template>
              <template #append>
                <div class="art-address-picker__actions">
                  <ElButton
                    v-if="showLocateButton"
                    class="art-address-picker__action"
                    :disabled="disabled || locating"
                    aria-label="定位当前位置"
                    title="定位当前位置"
                    @click="() => void locateCurrent()"
                  >
                    <span class="art-address-picker__action-content">
                      <ElIcon v-if="locating" class="is-loading"><Loading /></ElIcon>
                      <ElIcon v-else><Aim /></ElIcon>
                      <span>当前位置</span>
                    </span>
                  </ElButton>
                  <ElButton
                    class="art-address-picker__action"
                    :disabled="disabled"
                    aria-label="打开地图选择地址"
                    title="打开地图选择地址"
                    @click="handleOpenPicker"
                  >
                    <span class="art-address-picker__action-content">
                      <ElIcon><MapLocation /></ElIcon>
                      <span>地图选择</span>
                    </span>
                  </ElButton>
                </div>
              </template>
            </ElInput>

            <div class="art-address-picker__mobile-actions">
              <ElButton
                v-if="showLocateButton"
                :disabled="disabled || locating"
                aria-label="定位当前位置"
                @click="() => void locateCurrent()"
              >
                <span class="art-address-picker__action-content">
                  <ElIcon v-if="locating" class="is-loading"><Loading /></ElIcon>
                  <ElIcon v-else><Aim /></ElIcon>
                  <span>当前位置</span>
                </span>
              </ElButton>
              <ElButton
                :disabled="disabled"
                aria-label="打开地图选择地址"
                @click="handleOpenPicker"
              >
                <span class="art-address-picker__action-content">
                  <ElIcon><MapLocation /></ElIcon>
                  <span>地图选择</span>
                </span>
              </ElButton>
            </div>

            <div v-if="showCoordinateHint" class="art-address-picker__hint">
              <ElTag :type="statusMeta.type" effect="light" round>{{ statusMeta.label }}</ElTag>
              <span v-if="hasCoordinate">经度 {{ longitude }} · 纬度 {{ latitude }}</span>
              <span v-else>地图选择后自动回填地址和坐标</span>
            </div>
          </div>
        </ElFormItem>
      </ElCol>
    </ElRow>

    <Teleport to="body">
      <ArtDialog
        ref="dialogRef"
        width="1080px"
        :show-footer="true"
        :use-scrollbar="false"
        append-to-body
        :close-on-click-modal="false"
        show-fullscreen-button
        @opened="handleDialogOpened"
        @close="handleDialogClose"
        @fullscreen-change="handleMapFullscreenChange"
      >
        <div class="art-address-picker-map">
          <ArtAddressMap
            ref="mapRef"
            class="art-address-picker-map__canvas"
            v-model:search-keyword="searchKeyword"
            :amap-key="amapKey"
            :amap-security-js-code="amapSecurityJsCode"
            :show-poi-search="true"
            enable-map-pick
            :search-scope="searchScope"
            :city-limit="limitSearchCity"
            :region-path="regionPath"
            :region-adcode="regionAdcode"
            :region-search-text="regionSearchText"
            :district-level="districtLevel"
            :fallback-address="fullAddress || addressDetail"
            :message="mapMessage"
            @location-pick="setDraftLocation"
            @error="mapMessage = $event"
          />
        </div>

        <template #footer="{ api }">
          <div class="art-address-picker-map__footer">
            <div class="art-address-picker-map__selected">
              <span class="art-address-picker-map__selected-label">已选地址</span>
              <strong>{{ draftAddress || '请搜索或点击地图选择地址' }}</strong>
            </div>
            <div class="art-address-picker-map__coordinate">
              <span>地址坐标</span>
              <strong>{{ draftCoordinateText || '-' }}</strong>
            </div>
            <div>
              <ElButton @click="api.handleClose()">取消</ElButton>
              <ElButton
                type="primary"
                :disabled="!canConfirmPick"
                @click="() => void api.handleConfirm()"
              >
                保存地址
              </ElButton>
            </div>
          </div>
        </template>
      </ArtDialog>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { useEventListener } from '@vueuse/core'
  import { normalizeCoordinatePair } from '@/utils/geo'
  import { formatCoordinateValue } from '@/utils/ui/coordinates'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { Aim, Loading, Location, MapLocation } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  import { trim } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtPickerEmpty from '@/components/core/feedback/art-picker-empty/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import {
    useAmapGeolocation,
    type AmapLocationAddressComponent
  } from '@/hooks/core/useAmapGeolocation'
  import { artOverlayRequestScopeKey } from '@/hooks/core/useArtOverlay'
  import { stripRegionPrefix } from './address'
  import ArtAddressMap from './modules/map.vue'
  import type {
    AddressCoordinateSource,
    AddressCoordinateStatus,
    AddressCoordinateSystem,
    AddressLocateOptions,
    AddressLocationPayload,
    AddressMapPickResult,
    AddressRegionOption
  } from './types'

  defineOptions({ name: 'ArtAddressPicker' })

  type DistrictLevel = 'province' | 'city' | 'district'

  interface Props {
    regionOptions?: AddressRegionOption[]
    regionApi?: () => Promise<AddressRegionOption[]>
    amapKey?: string
    amapSecurityJsCode?: string
    disabled?: boolean
    clearable?: boolean
    filterable?: boolean
    gutter?: number
    regionSpan?: number
    detailSpan?: number
    regionLabel?: string
    detailLabel?: string
    regionPlaceholder?: string
    detailPlaceholder?: string
    detailMaxlength?: number
    labelWidth?: string | number
    regionPathProp?: string
    addressDetailProp?: string
    cascaderProps?: Record<string, unknown>
    openPickerOnFocus?: boolean
    showCoordinateHint?: boolean
    showLocateButton?: boolean
    hideRegionSelector?: boolean
  }

  interface MapExpose {
    initialize: (options: { center: [number, number]; zoom?: number }) => Promise<unknown>
    setMarker: (longitude: number | string, latitude: number | string) => void
    setZoomAndCenter: (zoom: number, center: [number, number]) => void
    centerByRegion: () => void
    resize: () => void
    searchPoi: (options?: { silent?: boolean; fallbackKeyword?: string }) => void
    setSearchKeyword: (value: string) => void
    setPickedLocation: (payload: AddressMapPickResult) => void
    clearPoi: () => void
    destroy: () => void
  }

  interface FormItemExpose {
    clearValidate: () => void
  }

  const props = withDefaults(defineProps<Props>(), {
    regionOptions: () => [],
    regionApi: undefined,
    amapKey: '',
    amapSecurityJsCode: '',
    disabled: false,
    clearable: true,
    filterable: true,
    gutter: 20,
    regionSpan: 8,
    detailSpan: 16,
    regionLabel: '区域',
    detailLabel: '详细地址',
    regionPlaceholder: '请选择省 / 市 / 区',
    detailPlaceholder: '请输入道路、门牌号、小区、楼栋等，或点击地图选择',
    detailMaxlength: 200,
    labelWidth: '100px',
    regionPathProp: 'regionPath',
    addressDetailProp: 'addressDetail',
    cascaderProps: () => ({}),
    openPickerOnFocus: false,
    showCoordinateHint: true,
    showLocateButton: false,
    hideRegionSelector: false
  })

  const emit = defineEmits<{
    (event: 'address-change', payload: AddressLocationPayload): void
    (event: 'locate-error', message: string): void
    (event: 'locate-success', payload: AddressLocationPayload): void
    (event: 'pick-confirm', payload: AddressLocationPayload): void
  }>()

  const regionPath = defineModel<string[]>('regionPath', { default: () => [] })
  const addressDetail = defineModel<string>('addressDetail', { default: '' })
  const regionAdcode = defineModel<string | null | undefined>('regionAdcode', {
    default: undefined
  })
  const longitude = defineModel<number | string | null | undefined>('longitude', { default: null })
  const latitude = defineModel<number | string | null | undefined>('latitude', { default: null })
  const coordinateSystem = defineModel<AddressCoordinateSystem | null | undefined>(
    'coordinateSystem',
    {
      default: 'gcj02'
    }
  )
  const coordinateSource = defineModel<AddressCoordinateSource | '' | null | undefined>(
    'coordinateSource',
    {
      default: ''
    }
  )
  const coordinateStatus = defineModel<AddressCoordinateStatus | null | undefined>(
    'coordinateStatus',
    {
      default: 'pending'
    }
  )
  const geocodeProvider = defineModel<string | null | undefined>('geocodeProvider', {
    default: undefined
  })
  const geocodedAt = defineModel<string | null | undefined>('geocodedAt', { default: undefined })

  const dialogRef = ref<ArtDialogExpose>()
  const mapRef = ref<MapExpose>()
  const regionFormItemRef = ref<FormItemExpose>()
  const detailFormItemRef = ref<FormItemExpose>()
  const regionLoading = ref(false)
  const loadedRegionOptions = ref<AddressRegionOption[]>([])
  const searchKeyword = ref('')
  const draftAddress = ref('')
  const draftLongitude = ref<number | string | null>(null)
  const draftLatitude = ref<number | string | null>(null)
  const draftRegionPath = ref<string[]>([])
  const draftRegionAdcode = ref<string>()
  const mapMessage = ref('')
  const locating = ref(false)
  const overlayScope = inject(artOverlayRequestScopeKey, undefined)
  let locationRequest: AbortController | undefined
  let locationPending: Promise<AddressLocationPayload | undefined> | undefined
  let applyingLocation = false
  let pickerSession = 0
  const { getCurrentLocation } = useAmapGeolocation({
    key: () => props.amapKey || import.meta.env.VITE_AMAP_KEY,
    securityJsCode: () => props.amapSecurityJsCode || import.meta.env.VITE_AMAP_SECURITY_JS_CODE
  })

  const cancelLocate = (): void => {
    const request = locationRequest
    if (!request) return
    locationRequest = undefined
    locationPending = undefined
    locating.value = false
    request.abort()
  }
  watch(
    [addressDetail, regionPath, regionAdcode, longitude, latitude, coordinateSystem],
    () => {
      if (!applyingLocation) cancelLocate()
    },
    { deep: true, flush: 'sync' }
  )
  watch(
    [() => props.disabled, () => overlayScope?.visible.value, () => overlayScope?.version.value],
    cancelLocate,
    { flush: 'sync' }
  )
  onBeforeUnmount(cancelLocate)
  onDeactivated(cancelLocate)

  const resolvedRegionOptions = computed(() =>
    props.regionOptions.length ? props.regionOptions : loadedRegionOptions.value
  )

  const resolvedDetailSpan = computed(() => (props.hideRegionSelector ? 24 : props.detailSpan))

  const mergedCascaderProps = computed<Record<string, unknown>>(() => ({
    label: 'name',
    value: 'name',
    children: 'children',
    emitPath: true,
    checkStrictly: true,
    ...props.cascaderProps
  }))

  const hasCoordinate = computed(
    () => normalizeCoordinatePair(longitude.value, latitude.value) !== null
  )

  const canConfirmPick = computed(
    () =>
      Boolean(draftAddress.value) &&
      normalizeCoordinatePair(draftLongitude.value, draftLatitude.value) !== null
  )

  const draftCoordinateText = computed(() =>
    formatCoordinateValue(draftLongitude.value, draftLatitude.value, { emptyText: '' })
  )

  const effectiveCoordinateStatus = computed<AddressCoordinateStatus>(() => {
    if (!hasCoordinate.value && coordinateStatus.value === 'located') return 'unconfirmed'
    if (hasCoordinate.value && (!coordinateStatus.value || coordinateStatus.value === 'pending')) {
      return 'located'
    }
    return coordinateStatus.value || 'pending'
  })

  const currentRegionPath = computed(() =>
    Array.isArray(regionPath.value) ? regionPath.value : []
  )

  const regionText = computed(() => currentRegionPath.value.filter(Boolean).join('/'))

  const fullAddress = computed(() => {
    if (props.hideRegionSelector) return trim(addressDetail.value)
    const region = currentRegionPath.value.filter(Boolean).join('')
    return trim([region, addressDetail.value].filter(Boolean).join(' '))
  })

  const searchScope = computed(
    () =>
      findRegionAdcode(resolvedRegionOptions.value, currentRegionPath.value) ||
      currentRegionPath.value.at(-1) ||
      currentRegionPath.value[1] ||
      currentRegionPath.value[0] ||
      '全国'
  )

  const limitSearchCity = computed(() => searchScope.value !== '全国')

  const regionSearchText = computed(() => currentRegionPath.value.filter(Boolean).join(''))

  const districtLevel = computed<DistrictLevel>(() => {
    if (currentRegionPath.value.length >= 3) return 'district'
    if (currentRegionPath.value.length === 2) return 'city'
    return 'province'
  })

  const statusMeta = computed(() => {
    if (locating.value) return { label: '定位中…', type: 'info' as const }
    const statusMap: Record<
      string,
      { label: string; type: 'success' | 'warning' | 'info' | 'danger' }
    > = {
      located: { label: '已选点', type: 'success' },
      unconfirmed: { label: '待确认', type: 'warning' },
      failed: { label: '选点失败', type: 'danger' },
      pending: { label: '未选点', type: 'info' }
    }
    return statusMap[effectiveCoordinateStatus.value] ?? statusMap.pending
  })

  const createPayload = (): AddressLocationPayload => ({
    regionPath: [...currentRegionPath.value],
    region: regionText.value,
    regionAdcode: regionAdcode.value ?? undefined,
    addressDetail: addressDetail.value,
    fullAddress: fullAddress.value,
    longitude: longitude.value,
    latitude: latitude.value,
    coordinateSystem: coordinateSystem.value ?? 'gcj02',
    coordinateSource: coordinateSource.value ?? '',
    coordinateStatus: effectiveCoordinateStatus.value,
    geocodeProvider: geocodeProvider.value ?? undefined,
    geocodedAt: geocodedAt.value ?? undefined
  })

  const findRegionAdcode = (options: AddressRegionOption[], path: string[]): string | undefined => {
    let currentOptions = options
    let matchedCode: string | undefined
    for (const name of path) {
      const matched = currentOptions.find((item) => item.name === name)
      if (!matched) return matchedCode
      matchedCode = matched.code
      currentOptions = matched.children ?? []
    }
    return matchedCode
  }

  const findRegionPathByCode = (
    options: AddressRegionOption[],
    code: string,
    ancestors: string[] = []
  ): string[] | undefined => {
    for (const option of options) {
      const currentPath = [...ancestors, option.name]
      if (option.code === code) return currentPath
      const childPath = findRegionPathByCode(option.children ?? [], code, currentPath)
      if (childPath) return childPath
    }
    return undefined
  }

  const isSameRegionName = (first?: string, second?: string): boolean => {
    if (!first || !second) return false
    const normalize = (value: string) => value.replace(/[省市区县]/g, '')
    return first === second || normalize(first) === normalize(second)
  }

  const containsNamesInOrder = (path: string[], names: string[]): boolean => {
    if (!names.length) return false
    let nameIndex = 0
    for (const pathName of path) {
      if (isSameRegionName(pathName, names[nameIndex])) nameIndex += 1
      if (nameIndex >= names.length) return true
    }
    return false
  }

  const findRegionPathByNames = (
    options: AddressRegionOption[],
    names: string[],
    ancestors: string[] = []
  ): string[] | undefined => {
    for (const option of options) {
      const currentPath = [...ancestors, option.name]
      if (containsNamesInOrder(currentPath, names)) return currentPath
      const childPath = findRegionPathByNames(option.children ?? [], names, currentPath)
      if (childPath) return childPath
    }
    return undefined
  }

  const resolveRegionPath = (payload: AddressMapPickResult): string[] => {
    const options = resolvedRegionOptions.value
    const matchedByCode = payload.regionAdcode
      ? findRegionPathByCode(options, payload.regionAdcode)
      : undefined
    if (matchedByCode?.length) return matchedByCode
    const names = payload.regionPath.filter(Boolean)
    return findRegionPathByNames(options, names) ?? names
  }

  const normalizeLocatedRegionPath = (component?: AmapLocationAddressComponent): string[] => {
    const city = Array.isArray(component?.city) ? component?.city[0] : component?.city
    return [component?.province, city, component?.district]
      .map((value) => trim(String(value ?? '')))
      .filter(Boolean)
  }

  const applyLocatedAddress = (payload: AddressMapPickResult): AddressLocationPayload => {
    const nextRegionPath = resolveRegionPath(payload)
    addressDetail.value = props.hideRegionSelector
      ? trim(payload.address)
      : stripRegionPrefix(payload.address, nextRegionPath)
    regionPath.value = nextRegionPath
    regionAdcode.value =
      payload.regionAdcode ?? findRegionAdcode(resolvedRegionOptions.value, nextRegionPath)
    longitude.value = payload.longitude
    latitude.value = payload.latitude
    coordinateSystem.value = 'gcj02'
    coordinateSource.value = 'device_geolocation'
    coordinateStatus.value = 'located'
    geocodeProvider.value = 'amap'
    geocodedAt.value = new Date().toISOString()
    setDraftLocation(payload)
    mapRef.value?.setPickedLocation(payload)
    mapRef.value?.setZoomAndCenter(17, [Number(payload.longitude), Number(payload.latitude)])
    const result = createPayload()
    void nextTick(() => {
      regionFormItemRef.value?.clearValidate()
      detailFormItemRef.value?.clearValidate()
    })
    emit('address-change', result)
    emit('locate-success', result)
    return result
  }

  const locateCurrent = (
    options: AddressLocateOptions = {}
  ): Promise<AddressLocationPayload | undefined> => {
    if (locationRequest && locationPending) return locationPending
    if (props.disabled || locating.value || (overlayScope && !overlayScope.visible.value))
      return Promise.resolve(undefined)
    const request = new AbortController()
    locationRequest = request
    locating.value = true
    locationPending = performLocate(options, request)
    return locationPending
  }

  const performLocate = async (
    options: AddressLocateOptions,
    request: AbortController
  ): Promise<AddressLocationPayload | undefined> => {
    try {
      const result = await getCurrentLocation(request.signal)
      if (locationRequest !== request || request.signal.aborted) return undefined
      const position = {
        longitude: Number(result.longitude.toFixed(7)),
        latitude: Number(result.latitude.toFixed(7))
      }
      const regionPath = normalizeLocatedRegionPath(result.addressComponent)
      const address = trim(result.formattedAddress || '')
      const payload: AddressMapPickResult = {
        address: address || `${position.longitude}, ${position.latitude}`,
        longitude: position.longitude,
        latitude: position.latitude,
        regionPath,
        regionAdcode: result.addressComponent?.adcode
      }
      applyingLocation = true
      const located = applyLocatedAddress(payload)
      if (!options.silent && !request.signal.aborted)
        ElMessage.success('当前位置已回填，请核对地址与坐标')
      return located
    } catch (error) {
      if (request.signal.aborted || locationRequest !== request) return undefined
      const message = getFriendlySupabaseErrorMessage(error, '当前位置获取失败，请重试')
      if (!hasCoordinate.value) coordinateStatus.value = 'failed'
      emit('locate-error', message)
      if (!options.silent) ElMessage.warning(message)
      return undefined
    } finally {
      applyingLocation = false
      if (locationRequest === request) {
        locationRequest = undefined
        locationPending = undefined
        locating.value = false
      }
    }
  }

  const markCoordinateUnconfirmed = (): void => {
    if (!hasCoordinate.value || coordinateStatus.value === 'unconfirmed') return
    coordinateStatus.value = 'unconfirmed'
  }

  const clearCoordinateState = (): void => {
    longitude.value = null
    latitude.value = null
    coordinateSource.value = ''
    coordinateStatus.value = 'pending'
    geocodeProvider.value = undefined
    geocodedAt.value = undefined
    draftLongitude.value = null
    draftLatitude.value = null
  }

  const clearLocationState = (): void => {
    addressDetail.value = ''
    clearCoordinateState()
    draftAddress.value = ''
    draftRegionPath.value = []
    draftRegionAdcode.value = undefined
    searchKeyword.value = ''
  }

  const handleRegionChange = (): void => {
    cancelLocate()
    if (!currentRegionPath.value.length) {
      regionAdcode.value = undefined
      clearLocationState()
      emit('address-change', createPayload())
      return
    }
    regionAdcode.value = findRegionAdcode(resolvedRegionOptions.value, currentRegionPath.value)
    markCoordinateUnconfirmed()
    emit('address-change', createPayload())
  }

  const handleDetailChange = (): void => {
    cancelLocate()
    markCoordinateUnconfirmed()
    emit('address-change', createPayload())
  }

  const handleDetailClear = (): void => {
    cancelLocate()
    clearCoordinateState()
    draftAddress.value = ''
    searchKeyword.value = ''
    emit('address-change', createPayload())
  }

  const setDraftLocation = (payload: AddressMapPickResult): void => {
    const nextRegionPath = resolveRegionPath(payload)
    draftAddress.value = payload.address
    draftLongitude.value = payload.longitude
    draftLatitude.value = payload.latitude
    draftRegionPath.value = nextRegionPath.length ? nextRegionPath : draftRegionPath.value
    draftRegionAdcode.value =
      payload.regionAdcode ??
      findRegionAdcode(resolvedRegionOptions.value, nextRegionPath) ??
      draftRegionAdcode.value
    mapRef.value?.setMarker(payload.longitude, payload.latitude)
  }

  const initializeMap = async (session: number): Promise<void> => {
    mapMessage.value = ''
    const defaultCenter: [number, number] = hasCoordinate.value
      ? [Number(longitude.value), Number(latitude.value)]
      : [120.1551, 30.2741]
    await mapRef.value?.initialize({
      center: defaultCenter,
      zoom: hasCoordinate.value ? 15 : 11
    })
    if (session !== pickerSession) return

    if (hasCoordinate.value) {
      setDraftLocation({
        address: fullAddress.value || addressDetail.value,
        longitude: longitude.value!,
        latitude: latitude.value!,
        regionPath: currentRegionPath.value,
        regionAdcode: regionAdcode.value ?? undefined
      })
    } else {
      mapRef.value?.centerByRegion()
    }

    mapRef.value?.resize()
  }

  const waitForMapLayout = async (): Promise<void> => {
    await nextTick()
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
  }

  const handleOpenPicker = async (): Promise<void> => {
    if (props.disabled) return
    cancelLocate()
    pickerSession += 1
    regionAdcode.value = findRegionAdcode(resolvedRegionOptions.value, currentRegionPath.value)
    searchKeyword.value = fullAddress.value
    draftAddress.value = fullAddress.value || addressDetail.value
    draftLongitude.value = longitude.value ?? null
    draftLatitude.value = latitude.value ?? null
    draftRegionPath.value = [...currentRegionPath.value]
    draftRegionAdcode.value = regionAdcode.value ?? undefined
    mapMessage.value = ''
    await dialogRef.value?.handleOpen(undefined, {
      title: '选择地址',
      width: '1080px',
      confirmText: '保存地址',
      onConfirm: () => {
        confirmPick()
      },
      dialogProps: {
        class: 'art-address-picker-dialog'
      }
    })
  }

  const handleDialogOpened = async (): Promise<void> => {
    const session = pickerSession
    try {
      await waitForMapLayout()
      if (session !== pickerSession) return
      await initializeMap(session)
      if (session !== pickerSession) return
      mapRef.value?.setSearchKeyword(searchKeyword.value)
      if (hasCoordinate.value) {
        mapRef.value?.setPickedLocation({
          address: draftAddress.value,
          longitude: draftLongitude.value!,
          latitude: draftLatitude.value!,
          regionPath: draftRegionPath.value,
          regionAdcode: draftRegionAdcode.value
        })
      } else if (searchKeyword.value) {
        mapRef.value?.searchPoi({ silent: true, fallbackKeyword: fullAddress.value })
      }
      await waitForMapLayout()
      if (session !== pickerSession) return
      mapRef.value?.resize()
    } catch (error) {
      if (session !== pickerSession) return
      mapMessage.value = getFriendlySupabaseErrorMessage(
        error,
        '地图加载失败，请稍后重试或手动填写地址'
      )
    }
  }

  const handleDialogClose = (): void => {
    pickerSession += 1
    mapRef.value?.destroy()
    mapMessage.value = ''
  }
  onBeforeUnmount(handleDialogClose)

  const handleMapFullscreenChange = async (): Promise<void> => {
    await waitForMapLayout()
    await waitForMapLayout()
    mapRef.value?.resize()
  }

  const confirmPick = (): void => {
    if (!canConfirmPick.value) return
    const nextRegionPath = draftRegionPath.value.length
      ? draftRegionPath.value
      : currentRegionPath.value
    addressDetail.value = props.hideRegionSelector
      ? trim(draftAddress.value)
      : stripRegionPrefix(draftAddress.value, nextRegionPath)
    longitude.value = draftLongitude.value
    latitude.value = draftLatitude.value
    coordinateSystem.value = 'gcj02'
    coordinateSource.value = 'map_pick'
    coordinateStatus.value = 'located'
    geocodeProvider.value = 'amap'
    geocodedAt.value = new Date().toISOString()
    if (nextRegionPath.length) {
      regionPath.value = nextRegionPath
      regionAdcode.value =
        draftRegionAdcode.value ?? findRegionAdcode(resolvedRegionOptions.value, nextRegionPath)
    }
    void nextTick(() => {
      regionFormItemRef.value?.clearValidate()
      detailFormItemRef.value?.clearValidate()
    })
    emit('pick-confirm', createPayload())
  }

  const loadRegionOptions = async (): Promise<void> => {
    if (!props.regionApi || props.regionOptions.length) return
    regionLoading.value = true
    try {
      loadedRegionOptions.value = await props.regionApi()
      regionAdcode.value = findRegionAdcode(loadedRegionOptions.value, regionPath.value)
    } finally {
      regionLoading.value = false
    }
  }

  watch(
    () => props.regionOptions,
    (options) => {
      if (!options.length) return
      regionAdcode.value = findRegionAdcode(options, regionPath.value)
    },
    { deep: true }
  )

  const handleViewportResize = (): void => {
    if (!unref(dialogRef.value?.visible)) return
    void nextTick(() => {
      mapRef.value?.resize()
    })
  }

  onMounted(() => {
    void loadRegionOptions()
  })

  useEventListener(window, 'resize', handleViewportResize)
  useEventListener(window.visualViewport, 'resize', handleViewportResize)

  defineExpose({
    locateCurrent,
    cancelLocate,
    openPicker: handleOpenPicker
  })
</script>

<style scoped lang="scss">
  .art-address-picker {
    width: 100%;

    &__control {
      width: 100%;
    }

    &__detail {
      width: 100%;
      min-width: 0;
    }

    &__actions {
      display: inline-flex;
      align-items: stretch;
      height: 100%;
    }

    &__action {
      height: 100%;
      min-height: var(--el-component-size);
      padding-inline: 20px;
      margin: 0 !important;
      border: 0;
      border-radius: 0;
    }

    &__action-content {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 16px;
      line-height: 1;
    }

    :deep(.art-address-picker__action > span) {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }

    &__action-content :deep(.el-icon) {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin: 0;
      font-size: 16px;
      line-height: 1;
    }

    &__action-content :deep(svg) {
      display: block;
    }

    &__action-content > span {
      display: inline-flex;
      align-items: center;
      height: 16px;
      margin-left: 0 !important;
      line-height: 16px;
    }

    &__mobile-actions {
      display: none;
    }

    &__hint {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 6px;
      font-size: 12px;
      line-height: 20px;
      color: var(--el-text-color-secondary);
    }
  }

  .art-address-picker-map {
    position: relative;
    flex: none;
    width: 100%;
    height: calc(min(820px, 100dvh - 32px) - 136px);
    min-height: 0;
    overflow: hidden;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);

    &__canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    &__footer {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) minmax(180px, 280px) auto auto;
      gap: 12px;
      align-items: center;
      width: 100%;
    }

    &__selected,
    &__coordinate {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }

    &__selected-label,
    &__coordinate span {
      flex: none;
      color: var(--el-text-color-secondary);
    }

    &__selected strong,
    &__coordinate strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--el-text-color-primary);
      white-space: nowrap;
    }
  }

  :global(.art-address-picker-dialog:not(.is-fullscreen)) {
    display: flex;
    flex-direction: column;
    width: min(1080px, calc(100vw - 32px)) !important;
    height: min(820px, calc(100dvh - 32px));
    max-height: calc(100dvh - 32px);
    overflow: hidden;
  }

  :global(.art-address-picker-dialog:not(.is-fullscreen) > .el-dialog__header),
  :global(.art-address-picker-dialog:not(.is-fullscreen) > .el-dialog__footer) {
    flex: none;
  }

  :global(.art-address-picker-dialog:not(.is-fullscreen) > .el-dialog__body) {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  :global(.art-address-picker-dialog:not(.is-fullscreen) .art-dialog__content) {
    display: flex;
    flex: 1;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  @media (width <= 900px) {
    .art-address-picker-map {
      &__footer {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }

  @media (width <= 600px) {
    :deep(.el-form-item) {
      display: block;
    }

    :deep(.el-form-item__label) {
      justify-content: flex-start;
      width: 100% !important;
      height: auto;
      margin-bottom: 8px;
      line-height: 20px;
    }

    :deep(.el-form-item__content) {
      width: 100%;
      margin-left: 0 !important;
    }

    :deep(.el-input-group__append) {
      display: none;
    }

    .art-address-picker__mobile-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;

      :deep(.el-button) {
        flex: 1;
        min-width: 0;
        margin: 0;
      }
    }
  }

  @media (height <= 720px) {
    .art-address-picker-map__footer {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .art-address-picker-map__coordinate {
      display: none;
    }
  }

  @media (height <= 520px) {
    :global(.art-address-picker-dialog:not(.is-fullscreen)) {
      height: calc(100dvh - 16px);
      max-height: calc(100dvh - 16px);
    }
  }

  :global(.art-address-picker-dialog.is-fullscreen > .el-dialog__body) {
    display: flex;
    flex-direction: column;
    overflow: hidden;

    --art-dialog-content-padding: 20px 24px 0;
  }

  :global(.art-address-picker-dialog.is-fullscreen .art-dialog__content) {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  :global(.art-address-picker-dialog.is-fullscreen .art-address-picker-map) {
    flex: 1;
    height: auto;
    min-height: 0;
  }

  :global(.art-address-picker-dialog.is-fullscreen > .el-dialog__footer) {
    flex: none;
  }
</style>
