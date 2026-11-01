<template>
  <ElPopover
    v-model:visible="open"
    width="min(320px, calc(100vw - 24px))"
    trigger="click"
    placement="bottom-end"
    :show-arrow="false"
    :popper-options="{
      modifiers: [
        { name: 'preventOverflow', options: { altAxis: true, tether: false, padding: 8 } }
      ]
    }"
    @show="focusAction"
  >
    <template #reference>
      <ArtIconButton
        ref="trigger"
        size="small"
        icon="ri:file-copy-line"
        label="复制当前结果视图"
        title="复制当前筛选、排序和显示列，包含表头与所有本地分页"
        :loading="busy"
        @keydown.esc.prevent.stop="close"
      />
    </template>
    <section
      aria-label="复制结果视图"
      class="flex min-w-0 flex-col gap-3"
      @keydown.esc.prevent.stop="close"
    >
      <div class="flex items-center justify-between gap-2">
        <strong class="text-sm text-g-900">复制当前结果视图</strong>
        <ArtIconButton size="small" icon="ri:close-line" label="关闭复制选项" @click="close" />
      </div>
      <ElScrollbar max-height="min(360px, calc(100dvh - 160px))">
        <div class="flex min-w-0 flex-col gap-3 pr-1 text-xs leading-5 text-g-700">
          <p class="m-0 tabular-nums" role="status">
            当前匹配 {{ rows.length }} 行 · 显示 {{ source.columns.length }} 列
          </p>
          <p class="m-0">含表头，跨本地分页；只复制显示列，不含编辑副本。</p>
          <p v-if="truncated" class="m-0">
            查询已达返回上限，仅复制本次已加载的匹配结果，不能代表数据库全量。
          </p>
          <p v-if="reason" class="m-0" role="status">{{ reason }}</p>
          <p v-if="!richSupported" class="m-0">
            当前浏览器不支持表格格式复制，可选择 TSV 或使用导出结果。
          </p>
          <p v-if="!textSupported" class="m-0"> 浏览器未提供剪贴板写入能力，请使用导出结果。 </p>
          <p class="m-0">
            按原值文本生成。Excel
            请先将目标区域设为文本，避免数字或公式自动识别；重要精度与类型请使用导出结果中的 Excel
            或 JSON。
          </p>
          <p class="m-0">TSV 为制表符分隔的纯文本，不包含单元格格式。</p>
          <p v-if="busy" class="m-0" role="status">正在准备并复制内容，请稍候。</p>
          <p v-if="error" class="m-0 text-danger" role="alert">{{ error }}</p>
        </div>
      </ElScrollbar>
      <div class="flex flex-wrap items-center gap-2">
        <ElButton
          ref="tableAction"
          type="primary"
          size="small"
          :disabled="unavailable || !richSupported"
          :loading="busy && format === 'table'"
          @click="copy('table')"
        >
          <ArtSvgIcon icon="ri:file-copy-line" />复制表格
        </ElButton>
        <ElButton
          ref="textAction"
          size="small"
          :disabled="unavailable || !textSupported"
          :loading="busy && format === 'text'"
          @click="copy('text')"
        >
          复制 TSV
        </ElButton>
      </div>
    </section>
  </ElPopover>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { filterTenantDimensionDescriptors } from '@/utils/tenant-dimension-visibility'
  import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { copyFormattedTextToClipboard, supportsFormattedClipboard } from '@/utils/file/clipboard'
  import {
    createSqlResultSnapshot,
    SqlResultCompareError,
    type SqlResultSnapshotInput
  } from './result-compare'
  import { createSqlResultClipboard, SqlResultClipboardError } from './result-clipboard'

  const props = defineProps<{
    rows: SqlResultSnapshotInput['rows']
    columns: SqlResultSnapshotInput['columns']
    owner: string
    disabled: boolean
    disabledReason?: string
    truncated?: boolean
  }>()
  const user = useUserStore()
  const tenant = useTenantScopeStore()
  const open = ref(false)
  const busy = ref(false)
  const error = ref('')
  const format = ref<'table' | 'text'>('table')
  const trigger = shallowRef<{ $el?: unknown }>()
  const tableAction = shallowRef<{ $el?: unknown }>()
  const textAction = shallowRef<{ $el?: unknown }>()
  const identity = computed(() =>
    JSON.stringify([
      user.getUserInfo.userId || 'signed-out',
      tenant.effectiveTenantId,
      user.isPlatformSuper,
      props.owner
    ])
  )
  const source = computed<SqlResultSnapshotInput>(() => ({
    rows: props.rows,
    columns: filterTenantDimensionDescriptors(
      props.columns.map((column) => ({
        column,
        prop: column.property ?? column.name,
        key: column.name,
        label: column.name
      })),
      tenant.isPlatformScope
    ).map(({ column }) => column),
    truncated: props.truncated
  }))
  const reason = computed(() =>
    props.disabled
      ? props.disabledReason || '当前结果暂不可复制，请稍后重试。'
      : !source.value.columns.length
        ? '当前没有可复制的显示列，请先恢复已获准字段。'
        : ''
  )
  const unavailable = computed(() => busy.value || Boolean(reason.value))
  const richSupported = computed(supportsFormattedClipboard)
  const textSupported = computed(
    () =>
      richSupported.value ||
      (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function')
  )
  let generation = 0
  let pending: AbortController | undefined
  let alive = true
  const cancel = (): void => {
    generation++
    pending?.abort()
    pending = undefined
    busy.value = false
    error.value = ''
  }
  const reset = (): void => {
    cancel()
    open.value = false
  }
  const close = (): void => {
    open.value = false
    const owner = identity.value
    void nextTick(() => {
      const button = trigger.value?.$el
      if (
        alive &&
        owner === identity.value &&
        button instanceof HTMLButtonElement &&
        !button.disabled
      )
        button.focus()
    })
  }
  const focusAction = (): void => {
    const active = generation
    const owner = identity.value
    void nextTick(() => {
      if (!alive || !open.value || active !== generation || owner !== identity.value) return
      for (const action of [tableAction.value, textAction.value]) {
        const button = action?.$el
        if (button instanceof HTMLButtonElement && !button.disabled) {
          button.focus()
          return
        }
      }
    })
  }
  const yieldControl = (): Promise<void> =>
    new Promise((resolve) => globalThis.setTimeout(resolve, 0))
  const copy = async (selected: 'table' | 'text'): Promise<void> => {
    if (
      !alive ||
      unavailable.value ||
      (selected === 'table' ? !richSupported.value : !textSupported.value)
    )
      return
    const input = source.value
    const owner = identity.value
    const active = ++generation
    const controller = new AbortController()
    const assertTenantScope = createTenantScopeReadGuard()
    pending = controller
    busy.value = true
    format.value = selected
    error.value = ''
    const valid = (): boolean => {
      if (
        !alive ||
        props.disabled ||
        controller.signal.aborted ||
        active !== generation ||
        owner !== identity.value ||
        input !== source.value
      )
        return false
      try {
        assertTenantScope()
        return true
      } catch {
        return false
      }
    }
    const assertCurrent = (): void => {
      if (!valid()) throw new DOMException('Copy preparation cancelled', 'AbortError')
    }
    try {
      // Start the native write in the click stack. ClipboardItem promises allow
      // bounded preparation while preserving the browser's user activation.
      await copyFormattedTextToClipboard(async () => {
        assertCurrent()
        const snapshot = await createSqlResultSnapshot(input, {
          signal: controller.signal,
          yieldControl
        })
        assertCurrent()
        const payload = createSqlResultClipboard(snapshot)
        assertCurrent()
        return payload
      }, selected)
      if (valid())
        ElMessage.success(
          selected === 'table'
            ? `已复制表格 · ${input.rows.length} 行 / ${input.columns.length} 列`
            : `已复制 TSV · ${input.rows.length} 行 / ${input.columns.length} 列；粘贴前请设置文本格式`
        )
    } catch (cause) {
      if (!valid() || (cause instanceof DOMException && cause.name === 'AbortError')) return
      error.value =
        cause instanceof SqlResultCompareError || cause instanceof SqlResultClipboardError
          ? cause.message
          : getFriendlySupabaseErrorMessage(cause, '复制失败，请检查剪贴板权限或使用导出结果')
    } finally {
      // Permission failures may arrive before deferred preparation settles.
      controller.abort()
      if (active === generation) {
        busy.value = false
        pending = undefined
      }
    }
  }
  watch(identity, reset, { flush: 'sync' })
  watch(source, reset, { flush: 'sync' })
  watch(
    () => props.disabled,
    (disabled) => {
      if (disabled) reset()
    },
    { flush: 'sync' }
  )
  watch(
    open,
    (visible) => {
      if (!visible) cancel()
    },
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    alive = false
    cancel()
  })
</script>
