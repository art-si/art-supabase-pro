<template>
  <ElDropdown trigger="click" placement="bottom-end" :disabled="unavailable" @command="run">
    <ArtIconButton
      v-if="compact"
      ref="trigger"
      size="small"
      icon="ri:git-pull-request-line"
      label="结果对比"
      :title="hint"
      :variant="baseline ? 'solid' : 'ghost'"
      :disabled="unavailable"
      :loading="busy"
    />
    <ElButton
      v-else
      ref="trigger"
      size="small"
      :title="hint"
      :disabled="unavailable"
      :loading="busy"
    >
      <ArtSvgIcon icon="ri:git-pull-request-line" />结果对比
    </ElButton>
    <template #dropdown>
      <ElDropdownMenu>
        <ElDropdownItem v-if="baseline" disabled>
          基线 {{ baseline.rows.length }} 行 · {{ formatDateTimeValue(baseline.capturedAt) }}
        </ElDropdownItem>
        <ElDropdownItem command="capture" :disabled="!canSnapshot || busy">
          设为对比基线
        </ElDropdownItem>
        <ElDropdownItem command="compare" :disabled="!baseline || !canSnapshot || busy">
          打开结果对比
        </ElDropdownItem>
        <ElDropdownItem command="clear" divided :disabled="!baseline || busy">
          清除对比基线
        </ElDropdownItem>
      </ElDropdownMenu>
    </template>
  </ElDropdown>
  <component
    v-if="comparisonComponent"
    :is="comparisonComponent"
    ref="comparisonRef"
    :baseline="baseline"
    :current="current"
  />
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useLazyComponent } from '@/hooks/core/useLazyComponent'
  import { filterTenantDimensionDescriptors } from '@/utils/tenant-dimension-visibility'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { formatDateTimeValue } from '@/utils/ui'
  import {
    createSqlResultSnapshot,
    SqlResultCompareError,
    type SqlResultSnapshot,
    type SqlResultSnapshotInput
  } from './result-compare'

  interface ComparisonExpose {
    open: () => Promise<void>
    reset: () => void
  }
  const props = defineProps<{
    result: SqlResultSnapshotInput | null
    owner: string
    compact?: boolean
    disabled?: boolean
  }>()
  const user = useUserStore()
  const tenant = useTenantScopeStore()
  const baseline = shallowRef<SqlResultSnapshot | null>(null)
  const current = shallowRef<SqlResultSnapshot | null>(null)
  const busy = ref(false)
  const comparisonRef = ref<ComparisonExpose>()
  const trigger = shallowRef<{ $el?: unknown }>()
  const { component: comparisonComponent, load } = useLazyComponent(
    () => import('./result-comparison.vue')
  )
  const owner = computed(() =>
    JSON.stringify([
      user.getUserInfo.userId || 'signed-out',
      tenant.effectiveTenantId,
      user.isPlatformSuper,
      props.owner
    ])
  )
  const source = computed<SqlResultSnapshotInput | null>(() => {
    const result = props.result
    if (!result) return null
    const columns = filterTenantDimensionDescriptors(
      result.columns.map((column) => ({
        column,
        prop: column.property ?? column.name,
        key: column.name,
        label: column.name
      })),
      tenant.isPlatformScope
    ).map(({ column }) => column)
    return { ...result, columns }
  })
  const canSnapshot = computed(() => !props.disabled && Boolean(source.value?.columns.length))
  const unavailable = computed(() => busy.value || (!canSnapshot.value && !baseline.value))
  const hint = computed(() =>
    baseline.value
      ? `已保存 ${baseline.value.rows.length} 行对比基线，仅保留在当前内存中`
      : '先设为对比基线，再执行查询并打开结果对比'
  )
  let revision = 0
  let pending: AbortController | undefined
  let disposed = false
  const cancelCurrent = () => {
    revision++
    pending?.abort()
    pending = undefined
    busy.value = false
    current.value = null
    comparisonRef.value?.reset()
  }
  const reset = () => {
    cancelCurrent()
    baseline.value = null
  }
  const yieldControl = (): Promise<void> =>
    new Promise((resolve) => globalThis.setTimeout(resolve, 0))
  const run = async (command: unknown): Promise<void> => {
    if (busy.value || disposed) return
    if (command === 'clear') {
      reset()
      ElMessage.success('对比基线已清除')
      return
    }
    if (command !== 'capture' && command !== 'compare') return
    const input = source.value
    if (!canSnapshot.value || !input || (command === 'compare' && !baseline.value)) return
    const identity = owner.value
    const active = ++revision
    const controller = new AbortController()
    pending = controller
    busy.value = true
    const valid = () =>
      !disposed &&
      !props.disabled &&
      !controller.signal.aborted &&
      active === revision &&
      identity === owner.value &&
      input === source.value
    try {
      await yieldControl()
      const snapshot = await createSqlResultSnapshot(input, {
        signal: controller.signal,
        yieldControl
      })
      if (!valid()) return
      if (command === 'capture') {
        comparisonRef.value?.reset()
        current.value = null
        baseline.value = snapshot
        ElMessage.success(`已保存 ${snapshot.rows.length} 行对比基线，仅保留在内存中`)
        return
      }
      await load()
      if (!valid()) return
      current.value = snapshot
      busy.value = false
      await nextTick()
      if (valid()) {
        const element = trigger.value?.$el
        if (element instanceof HTMLButtonElement && !element.disabled) element.focus()
        await comparisonRef.value?.open()
      }
    } catch (cause) {
      if (!valid()) return
      ElMessage.warning(
        cause instanceof SqlResultCompareError
          ? cause.message
          : getFriendlySupabaseErrorMessage(cause, '结果快照创建失败，请缩小查询范围后重试')
      )
    } finally {
      if (active === revision) {
        busy.value = false
        pending = undefined
      }
    }
  }
  watch(owner, reset, { flush: 'sync' })
  watch(() => props.result, cancelCurrent, { flush: 'sync' })
  watch(
    () => props.disabled,
    (disabled) => {
      if (disabled) cancelCurrent()
    },
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    disposed = true
    reset()
  })
  defineExpose({ reset })
</script>
