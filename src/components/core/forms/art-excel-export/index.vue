<!-- 导出 Excel 文件 -->
<template>
  <ElButton
    :type="type"
    :size="size"
    :loading="isExporting"
    :disabled="disabled || (disableWhenEmpty && !hasData)"
    v-ripple
    @click="handleExport"
  >
    <template #loading>
      <ElIcon class="is-loading">
        <Loading />
      </ElIcon>
      {{ loadingText }}
    </template>
    <slot>{{ buttonText }}</slot>
  </ElButton>
</template>

<script setup lang="ts" generic="TRow extends object = Record<string, unknown>">
  import { ref, computed } from 'vue'
  import { Loading } from '@element-plus/icons-vue'
  import type { ButtonType } from 'element-plus'
  import { uniq } from 'lodash-es'
  import { useThrottleFn } from '@vueuse/core'
  import { exportExcel, type ExcelColumn } from '@/utils/file'

  defineOptions({ name: 'ArtExcelExport' })

  /** 导出数据类型 */
  type ExportValue = unknown

  /** 列配置 */
  interface ColumnConfig {
    /** 列标题 */
    title: string
    /** 列宽度 */
    width?: number
    /** 数据格式化函数 */
    formatter?: (value: ExportValue, row: TRow, index: number) => string
  }

  /** 导出配置选项 */
  interface ExportOptions {
    /** 数据源 */
    data: TRow[]
    /** 文件名（不含扩展名） */
    filename?: string
    /** 工作表名称 */
    sheetName?: string
    /** 按钮类型 */
    type?: ButtonType
    /** 按钮尺寸 */
    size?: 'large' | 'default' | 'small'
    /** 是否禁用 */
    disabled?: boolean
    /** 无数据时是否禁用按钮；关闭后点击会给出统一的无数据提示 */
    disableWhenEmpty?: boolean
    /** 按钮文本 */
    buttonText?: string
    /** 加载中文本 */
    loadingText?: string
    /** 是否自动添加序号列 */
    autoIndex?: boolean
    /** 序号列标题 */
    indexColumnTitle?: string
    /** 列配置映射 */
    columns?: Record<string, ColumnConfig>
    /** 表头映射（简化版本，向后兼容） */
    headers?: Record<string, string>
    /** 最大导出行数 */
    maxRows?: number
    /** 是否显示成功消息 */
    showSuccessMessage?: boolean
    /** 是否显示错误消息 */
    showErrorMessage?: boolean
    /** 工作簿配置 */
    workbookOptions?: {
      /** 创建者 */
      creator?: string
      /** 最后修改者 */
      lastModifiedBy?: string
      /** 创建时间 */
      created?: Date
      /** 修改时间 */
      modified?: Date
    }
  }

  const props = withDefaults(defineProps<ExportOptions>(), {
    filename: () => `export_${new Date().toISOString().slice(0, 10)}`,
    sheetName: 'Sheet1',
    type: 'primary',
    size: 'default',
    disabled: false,
    disableWhenEmpty: true,
    buttonText: '导出 Excel',
    loadingText: '导出中...',
    autoIndex: false,
    indexColumnTitle: '序号',
    columns: () => ({}),
    headers: () => ({}),
    maxRows: 100000,
    showSuccessMessage: true,
    showErrorMessage: true,
    workbookOptions: () => ({})
  })

  const emit = defineEmits<{
    'before-export': [data: TRow[]]
    'export-success': [filename: string, rowCount: number]
    'export-error': [error: ExportError]
    'export-progress': [progress: number]
  }>()

  /** 导出错误类型 */
  class ExportError extends Error {
    constructor(
      message: string,
      public code: string,
      public details?: unknown
    ) {
      super(message)
      this.name = 'ExportError'
    }
  }

  const isExporting = ref(false)

  /** 是否有数据可导出 */
  const hasData = computed(() => Array.isArray(props.data) && props.data.length > 0)

  /** 验证导出数据 */
  const validateData = (data: TRow[]): void => {
    if (!Array.isArray(data)) {
      throw new ExportError('数据必须是数组格式', 'INVALID_DATA_TYPE')
    }

    if (data.length === 0) {
      throw new ExportError('没有可导出的数据', 'NO_DATA')
    }

    if (data.length > props.maxRows) {
      throw new ExportError(`数据行数超过限制（${props.maxRows}行）`, 'EXCEED_MAX_ROWS', {
        currentRows: data.length,
        maxRows: props.maxRows
      })
    }
  }

  const buildColumns = (data: TRow[]): ExcelColumn<TRow>[] =>
    uniq(data.flatMap((row) => Object.keys(row))).map((key) => ({
      key,
      title: props.columns[key]?.title || props.headers[key] || key,
      width: props.columns[key]?.width,
      formatter: props.columns[key]?.formatter
    }))

  /** 处理导出 */
  const handleExport = useThrottleFn(
    async () => {
      if (isExporting.value) return

      isExporting.value = true

      try {
        // 验证数据
        validateData(props.data)

        // 触发导出前事件
        emit('before-export', props.data)

        // 执行导出
        await exportExcel({
          data: props.data,
          columns: buildColumns(props.data),
          filename: props.filename,
          sheetName: props.sheetName,
          autoIndex: props.autoIndex,
          indexColumnTitle: props.indexColumnTitle,
          maxRows: props.maxRows,
          filenameSuffix: 'datetime',
          workbookProperties: props.workbookOptions,
          onProgress: (progress) => emit('export-progress', progress)
        })

        // 触发成功事件
        emit('export-success', props.filename, props.data.length)

        // 显示成功消息
        if (props.showSuccessMessage) {
          ElMessage.success({
            message: `成功导出 ${props.data.length} 条数据`,
            duration: 3000
          })
        }
      } catch (error) {
        const exportError =
          error instanceof ExportError
            ? error
            : new ExportError('导出失败，请检查数据后重试', 'EXPORT_FAILED', error)

        // 触发错误事件
        emit('export-error', exportError)

        // 显示错误消息
        if (props.showErrorMessage) {
          const message = {
            message: exportError.message,
            duration: 5000
          }
          if (exportError.code === 'NO_DATA') ElMessage.warning(message)
          else ElMessage.error(message)
        }
      } finally {
        isExporting.value = false
        emit('export-progress', 0)
      }
    },
    1000,
    false
  )

  // 暴露方法供父组件调用
  defineExpose({
    exportData: handleExport,
    isExporting: readonly(isExporting),
    hasData
  })
</script>

<style scoped>
  .is-loading {
    animation: rotating 2s linear infinite;
  }

  @keyframes rotating {
    0% {
      transform: rotate(0deg);
    }

    100% {
      transform: rotate(360deg);
    }
  }
</style>
