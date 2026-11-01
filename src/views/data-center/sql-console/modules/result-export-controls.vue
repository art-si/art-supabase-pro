<template>
  <ElDropdown trigger="click" placement="bottom-end" :disabled="unavailable" @command="run">
    <ArtIconButton
      v-if="compact"
      size="small"
      icon="ri:download-2-line"
      label="导出查询结果"
      :title="hint"
      :disabled="unavailable"
      :loading="busy"
    />
    <ElButton v-else size="small" :title="hint" :disabled="unavailable" :loading="busy">
      <ArtSvgIcon icon="ri:download-2-line" />导出结果
    </ElButton>
    <template #dropdown>
      <ElDropdownMenu>
        <ElDropdownItem disabled>
          <span class="block max-w-64 whitespace-normal text-xs leading-5 text-g-700">
            <span class="block">{{ loadedHint }}</span>
            <span class="block">全部已加载原始结果，不受筛选、排序或编辑副本影响</span>
          </span>
        </ElDropdownItem>
        <ElDropdownItem command="excel" divided :disabled="unavailable">
          <span class="art-icon-label">
            <ArtSvgIcon icon="ri:file-excel-2-line" class="text-base" />
            <span>导出 Excel</span>
          </span>
        </ElDropdownItem>
        <ElDropdownItem command="json" :disabled="unavailable">
          <span class="art-icon-label">
            <ArtSvgIcon icon="ri:code-s-slash-line" class="text-base" />
            <span>导出 JSON（保留类型）</span>
          </span>
        </ElDropdownItem>
      </ElDropdownMenu>
    </template>
  </ElDropdown>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { filterTenantDimensionDescriptors } from '@/utils/tenant-dimension-visibility'
  import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { downloadBlob, exportExcel } from '@/utils/file'
  import {
    createSqlResultSnapshot,
    exportSqlResultSnapshot,
    SqlResultCompareError,
    type SqlResultSnapshotInput
  } from './result-compare'
  import { createSqlResultExcelColumns } from './result-export'

  const props = defineProps<{
    result: SqlResultSnapshotInput | null
    owner: string
    compact?: boolean
    disabled?: boolean
  }>()
  const user = useUserStore()
  const tenant = useTenantScopeStore()
  const busy = ref(false)
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
  const unavailable = computed(() => busy.value || props.disabled || !source.value?.columns.length)
  const loadedHint = computed(() => {
    const result = source.value
    if (!result) return '尚无查询结果'
    return `已加载 ${result.rows.length} 行${
      result.truncated ? ' · 已达返回上限' : result.rows.length === 0 ? ' · 可导出字段信息' : ''
    }`
  })
  const hint = computed(() => {
    if (busy.value) return '正在准备导出文件'
    if (props.disabled) return '当前结果暂不可导出'
    if (!source.value) return '执行查询后可导出；0 行结果也可导出字段信息'
    if (!source.value.columns.length) return '当前没有可导出的字段'
    return `${loadedHint.value}；导出全部已加载原始结果，不受筛选、排序或编辑副本影响`
  })
  let generation = 0
  let pending: AbortController | undefined
  let alive = true
  const cancel = (): void => {
    generation++
    pending?.abort()
    pending = undefined
    busy.value = false
  }
  const yieldControl = (): Promise<void> =>
    new Promise((resolve) => globalThis.setTimeout(resolve, 0))
  const run = async (command: unknown): Promise<void> => {
    if ((command !== 'excel' && command !== 'json') || unavailable.value || !alive) return
    const input = source.value
    if (!input) return
    const identity = owner.value
    const active = ++generation
    const controller = new AbortController()
    const assertTenantScope = createTenantScopeReadGuard()
    pending = controller
    busy.value = true
    const valid = (): boolean => {
      if (
        !alive ||
        props.disabled ||
        controller.signal.aborted ||
        active !== generation ||
        identity !== owner.value ||
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
    const assertCanDownload = (): void => {
      if (!valid()) throw new DOMException('Export cancelled', 'AbortError')
    }
    try {
      await yieldControl()
      const snapshot = await createSqlResultSnapshot(input, {
        signal: controller.signal,
        yieldControl
      })
      assertCanDownload()
      if (command === 'excel') {
        await exportExcel({
          data: snapshot.rows,
          columns: createSqlResultExcelColumns(snapshot),
          filename: 'SQL查询结果',
          filenameSuffix: 'datetime',
          allowEmpty: true,
          assertCanDownload
        })
      } else {
        const blob = new Blob([exportSqlResultSnapshot(snapshot)], {
          type: 'application/json;charset=utf-8'
        })
        assertCanDownload()
        downloadBlob(blob, `SQL查询结果_${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
      }
      if (valid()) ElMessage.success('查询结果已导出')
    } catch (cause) {
      if (!valid() || (cause instanceof DOMException && cause.name === 'AbortError')) return
      ElMessage.error(
        cause instanceof SqlResultCompareError
          ? cause.message
          : getFriendlySupabaseErrorMessage(cause, '结果导出失败，请缩小查询范围后重试')
      )
    } finally {
      if (active === generation) {
        busy.value = false
        pending = undefined
      }
    }
  }
  watch(owner, cancel, { flush: 'sync' })
  watch(source, cancel, { flush: 'sync' })
  watch(
    () => props.disabled,
    (disabled) => {
      if (disabled) cancel()
    },
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    alive = false
    cancel()
  })
</script>
