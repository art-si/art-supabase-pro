<template>
  <ElPopover
    v-model:visible="open"
    width="min(420px, calc(100vw - 24px))"
    trigger="click"
    placement="bottom-end"
    :show-arrow="false"
    :disabled="disabled"
    :popper-options="{
      modifiers: [
        { name: 'preventOverflow', options: { altAxis: true, tether: false, padding: 8 } }
      ]
    }"
    @show="focusFirstAction"
  >
    <template #reference>
      <ArtIconButton
        ref="trigger"
        size="small"
        icon="ri:bookmark-line"
        label="参数方案"
        title="保存和填入本机参数方案，不会自动调用 API"
        :disabled="disabled"
        @keydown="closeFromTrigger"
      />
    </template>
    <section
      ref="popup"
      aria-label="API 参数方案"
      class="flex min-w-0 flex-col gap-3"
      @keydown.esc.prevent.stop="close"
    >
      <div class="flex items-center justify-between gap-2">
        <strong class="text-sm text-g-900">参数方案</strong>
        <ArtIconButton size="small" icon="ri:close-line" label="关闭参数方案" @click="close" />
      </div>
      <ElScrollbar max-height="min(360px, calc(100dvh - 200px))">
        <div class="flex min-w-0 flex-col gap-3 pr-1 text-xs leading-5 text-g-700">
          <p class="m-0">
            仅保存在本机当前账号、当前租户的此 API 下。填入方案只替换参数，不会自动调用 API。
          </p>
          <div v-if="error" class="flex min-w-0 flex-col gap-2">
            <p class="m-0 break-words text-danger" role="alert">{{ error }}</p>
            <div class="flex flex-wrap items-center gap-2">
              <ElButton size="small" :disabled="disabled" @click="refresh"> 重新读取方案 </ElButton>
              <ElButton
                v-if="resettable"
                size="small"
                type="warning"
                plain
                :disabled="disabled"
                @click="reset"
              >
                重置此 API 的本机方案
              </ElButton>
            </div>
          </div>
          <p v-if="!presets.length" class="m-0 py-2" role="status">
            暂无参数方案。填好参数后，保存一份便于下次复用。
          </p>
          <ul v-else class="m-0 flex min-w-0 list-none flex-col gap-3 p-0">
            <li
              v-for="preset in presets"
              :key="preset.id"
              class="flex min-w-0 flex-col gap-1 border-b border-g-200 pb-3 last:border-0 last:pb-0"
            >
              <div class="flex min-w-0 items-center gap-2">
                <ElButton
                  size="small"
                  class="min-w-0 flex-1"
                  :disabled="disabled || resettable || !signatureMatches(preset)"
                  :aria-label="`填入参数方案 ${preset.name}`"
                  :title="preset.name"
                  data-preset-apply
                  @click="apply(preset)"
                >
                  <span class="flex min-w-0 items-center gap-1.5">
                    <span class="shrink-0">填入</span>
                    <span class="min-w-0 truncate">{{ preset.name }}</span>
                  </span>
                </ElButton>
                <div class="flex shrink-0 items-center gap-2">
                  <ArtIconButton
                    size="small"
                    icon="ri:save-3-line"
                    :label="`用当前参数更新方案 ${preset.name}`"
                    :disabled="disabled || resettable"
                    @click="update(preset)"
                  />
                  <ArtIconButton
                    size="small"
                    icon="ri:eye-line"
                    :label="`查看参数方案 ${preset.name}`"
                    :disabled="disabled"
                    @click="preview(preset)"
                  />
                  <ArtIconButton
                    size="small"
                    icon="ri:close-line"
                    :label="`取消保存参数方案 ${preset.name}`"
                    :disabled="disabled"
                    @click="forget(preset)"
                  />
                </div>
              </div>
              <p v-if="!signatureMatches(preset)" class="m-0 text-warning" role="status">
                参数定义已变化，请核对后重新保存
              </p>
              <p
                v-else-if="preset.definitionVersion !== definitionVersion"
                class="m-0 text-warning"
                role="status"
              >
                API 已更新，填入后请核对参数再调用
              </p>
            </li>
          </ul>
        </div>
      </ElScrollbar>
      <div class="flex flex-wrap items-center gap-2 border-t border-g-200 pt-3">
        <ElButton
          size="small"
          type="primary"
          :disabled="disabled || resettable"
          data-preset-save
          @click="save"
        >
          保存当前参数
        </ElButton>
      </div>
    </section>
  </ElPopover>
</template>

<script setup lang="ts">
  import { nextTick, onDeactivated, ref, shallowRef, watch } from 'vue'
  import type { SqlQueryApiParameterPreset } from './query-api-parameter-presets'

  defineOptions({ name: 'SqlQueryApiParameterPresets' })

  export interface QueryApiParameterPresetsExpose {
    close: () => void
  }

  const props = defineProps<{
    presets: readonly SqlQueryApiParameterPreset[]
    parameterSignature: string
    definitionVersion: string
    disabled?: boolean
    error?: string
    resettable?: boolean
  }>()
  const emit = defineEmits<{
    save: []
    apply: [preset: SqlQueryApiParameterPreset]
    update: [preset: SqlQueryApiParameterPreset]
    preview: [preset: SqlQueryApiParameterPreset]
    forget: [preset: SqlQueryApiParameterPreset]
    refresh: []
    reset: []
  }>()
  const open = ref(false)
  const trigger = shallowRef<{ $el?: unknown }>()
  const popup = ref<HTMLElement>()
  let focusRevision = 0
  const signatureMatches = (preset: SqlQueryApiParameterPreset): boolean =>
    preset.parameterSignature === props.parameterSignature
  const isCurrent = (preset: SqlQueryApiParameterPreset): boolean =>
    !props.disabled && props.presets.includes(preset)
  const close = (): void => {
    open.value = false
    const revision = ++focusRevision
    void nextTick(() => {
      const button = trigger.value?.$el
      if (revision === focusRevision && button instanceof HTMLButtonElement && !button.disabled)
        button.focus()
    })
  }
  const closeForAction = (): void => {
    focusRevision++
    open.value = false
  }
  const closeFromTrigger = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !open.value) return
    event.preventDefault()
    event.stopPropagation()
    close()
  }
  const focusFirstAction = (): void => {
    const revision = ++focusRevision
    void nextTick(() => {
      if (revision !== focusRevision || !open.value || props.disabled) return
      const first = popup.value?.querySelector<HTMLButtonElement>(
        'button[data-preset-apply]:not(:disabled), button[data-preset-save]:not(:disabled)'
      )
      const action = first ?? popup.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      action?.focus()
    })
  }
  const save = (): void => {
    if (props.disabled || props.resettable) return
    closeForAction()
    emit('save')
  }
  const apply = (preset: SqlQueryApiParameterPreset): void => {
    if (!isCurrent(preset) || props.resettable || !signatureMatches(preset)) return
    closeForAction()
    emit('apply', preset)
  }
  const update = (preset: SqlQueryApiParameterPreset): void => {
    if (isCurrent(preset) && !props.resettable) emit('update', preset)
  }
  const preview = (preset: SqlQueryApiParameterPreset): void => {
    if (!isCurrent(preset)) return
    closeForAction()
    emit('preview', preset)
  }
  const forget = (preset: SqlQueryApiParameterPreset): void => {
    if (isCurrent(preset)) emit('forget', preset)
  }
  const refresh = (): void => {
    if (!props.disabled) emit('refresh')
  }
  const reset = (): void => {
    if (!props.disabled && props.resettable) emit('reset')
  }
  watch(
    () => props.disabled,
    (disabled) => {
      if (disabled) closeForAction()
    },
    { flush: 'sync' }
  )
  watch(
    () => props.presets,
    () => {
      if (open.value && typeof document !== 'undefined' && document.activeElement === document.body)
        focusFirstAction()
    },
    { flush: 'post' }
  )
  onDeactivated(closeForAction)
  defineExpose<QueryApiParameterPresetsExpose>({ close })
</script>
