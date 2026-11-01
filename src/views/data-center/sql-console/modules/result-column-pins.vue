<template>
  <div ref="root" class="min-w-0">
    <ElPopover
      v-model:visible="open"
      width="min(360px, calc(100vw - 24px))"
      trigger="click"
      placement="bottom"
      :show-arrow="false"
      :popper-options="{
        modifiers: [
          { name: 'preventOverflow', options: { altAxis: true, tether: false, padding: 8 } }
        ]
      }"
      @before-enter="chooseField"
    >
      <template #reference>
        <ElButton
          size="small"
          :type="pins.length ? 'primary' : ''"
          :plain="Boolean(pins.length)"
          :disabled="disabled"
          aria-label="固定列"
          :aria-pressed="Boolean(pins.length)"
          @keydown="closeFromTrigger"
          ><ArtSvgIcon icon="ri:pushpin-line" />固定列</ElButton
        >
      </template>
      <div ref="popupRoot" class="flex min-w-0 flex-col gap-3" @keydown.esc.prevent.stop="close">
        <div class="flex items-center justify-between gap-2">
          <strong class="text-sm text-g-900">固定结果列</strong>
          <ArtIconButton size="small" icon="ri:close-line" label="关闭固定列设置" @click="close" />
        </div>
        <ElScrollbar max-height="calc(100dvh - 112px)">
          <div class="flex min-w-0 flex-col gap-3 pb-1">
            <label :for="fieldId" class="text-xs text-g-700">固定字段</label>
            <ElSelect
              :id="fieldId"
              v-model="field"
              filterable
              :clearable="false"
              :append-to="popupRoot"
              aria-label="固定字段"
              placeholder="选择当前显示的字段"
              class="w-full!"
            >
              <ElOption
                v-for="column in columns"
                :key="column.key"
                :label="column.label"
                :value="column.key"
              />
            </ElSelect>
            <span class="text-xs text-g-700">固定位置</span>
            <ElSegmented
              :model-value="side"
              :options="sideOptions"
              aria-label="固定位置"
              :disabled="!field"
              @change="changeSide"
            />
            <ElAlert
              v-if="!columns.length"
              title="当前没有显示的字段，请先在列设置中恢复字段。"
              type="info"
              :closable="false"
              show-icon
            />
            <ElAlert
              v-else-if="viewportWidth > 0 && viewportWidth < 640"
              title="当前工作区较窄，固定列已暂停；扩大工作区后会自动恢复。"
              type="info"
              :closable="false"
              show-icon
            />
            <p v-else-if="!ready" class="m-0 text-xs leading-5 text-g-700" role="status">
              表格布局正在更新，请稍后选择固定位置。
            </p>
            <ElAlert
              v-else-if="suspendedCount"
              title="部分固定列已暂停，扩大工作区或取消其他固定列后会自动恢复。"
              type="warning"
              :closable="false"
              show-icon
            />
            <div v-if="pins.length" class="flex min-w-0 flex-col gap-2 border-t border-g-200 pt-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-g-700">固定设置 · {{ pins.length }} 列</span>
                <ElButton link size="small" @click="emit('clear')">取消全部固定</ElButton>
              </div>
              <div v-for="pin in pins" :key="pin.key" class="flex min-w-0 items-center gap-2">
                <span class="min-w-0 flex-1 truncate font-mono text-xs" :title="label(pin.key)">{{
                  label(pin.key)
                }}</span>
                <span class="shrink-0 text-xs text-g-700">{{ pinState(pin) }}</span>
                <ArtIconButton
                  size="small"
                  icon="ri:unpin-line"
                  :label="`取消固定 ${label(pin.key)}`"
                  @click="emit('change', pin.key, null)"
                />
              </div>
            </div>
            <p class="m-0 text-xs leading-5 text-g-700">
              固定依据实际列宽，为其他字段保留滚动空间。隐藏列的固定设置会保留，重新显示后按空间恢复；编辑副本暂不固定。
            </p>
          </div>
        </ElScrollbar>
      </div>
    </ElPopover>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, useId, watch } from 'vue'
  import type { SqlColumnPin, SqlColumnPinSide } from './result-column-pins'

  interface PinField {
    key: string
    label: string
  }
  const props = defineProps<{
    columns: PinField[]
    allColumns: PinField[]
    pins: readonly SqlColumnPin[]
    applied: ReadonlyMap<string, SqlColumnPinSide>
    suspendedCount: number
    ready: boolean
    viewportWidth: number
    disabled?: boolean
  }>()
  const emit = defineEmits<{
    change: [key: string, side: SqlColumnPinSide | null]
    clear: []
  }>()
  const root = ref<HTMLElement>()
  const popupRoot = ref<HTMLElement>()
  const open = ref(false)
  const field = ref('')
  const fieldId = useId()
  const label = (key: string): string =>
    props.allColumns.find((column) => column.key === key)?.label || key
  const chooseField = () => {
    if (!props.columns.some((column) => column.key === field.value))
      field.value = props.columns[0]?.key || ''
  }
  const side = computed(() => props.pins.find((pin) => pin.key === field.value)?.side || 'none')
  const sideOptions = computed(() => [
    { label: '不固定', value: 'none' },
    { label: '固定左侧', value: 'left', disabled: !props.ready || props.viewportWidth < 640 },
    { label: '固定右侧', value: 'right', disabled: !props.ready || props.viewportWidth < 640 }
  ])
  const changeSide = (value: string | number | boolean) => {
    if (!field.value) return
    if (value === 'left' || value === 'right') emit('change', field.value, value)
    else if (value === 'none') emit('change', field.value, null)
  }
  const pinState = (pin: SqlColumnPin): string => {
    const position = pin.side === 'left' ? '左侧' : '右侧'
    if (!props.columns.some((column) => column.key === pin.key)) return `${position} · 已隐藏`
    return props.applied.has(pin.key) ? `${position} · 已固定` : `${position} · 已暂停`
  }
  const close = async () => {
    open.value = false
    await nextTick()
    root.value?.querySelector<HTMLButtonElement>('[aria-label="固定列"]')?.focus()
  }
  const closeFromTrigger = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open.value) return
    event.preventDefault()
    event.stopPropagation()
    void close()
  }
  watch(() => props.columns, chooseField)
  watch(
    () => props.disabled,
    (disabled) => {
      if (disabled) open.value = false
    }
  )
</script>
