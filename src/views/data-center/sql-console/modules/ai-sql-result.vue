<template>
  <section aria-label="AI SQL 生成结果" class="flex min-w-0 flex-col gap-3">
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <p class="art-icon-label m-0 min-w-0 text-sm font-medium text-g-800" role="status">
        <ArtSvgIcon icon="ri:check-line" class="size-4! shrink-0 text-success" aria-hidden="true" />
        <span class="min-w-0">SQL 已生成，请预览后选择载入方式</span>
      </p>
      <span v-if="model" class="min-w-0 text-xs text-g-700 [overflow-wrap:anywhere]"
        >模型：{{ model }}</span
      >
    </div>
    <p
      v-if="summary"
      class="m-0 whitespace-pre-wrap text-sm leading-6 text-g-800 [overflow-wrap:anywhere]"
      >{{ summary }}</p
    >
    <div v-if="warnings.length" class="min-w-0 text-xs leading-5 text-g-700">
      <p class="m-0 font-medium">请核对以下提示</p>
      <ul class="m-0 mt-1 list-disc space-y-1 pl-5">
        <li
          v-for="(warning, index) in warnings"
          :key="index"
          class="whitespace-pre-wrap [overflow-wrap:anywhere]"
          >{{ warning }}</li
        >
      </ul>
    </div>
    <PlanCodePreview
      title="AI SQL 预览"
      :code="sql"
      language="sql"
      expanded
      max-height="min(320px, 42dvh)"
    />
    <p class="m-0 text-xs leading-5 text-g-700">
      生成结果只作预览，不会自动执行。在新页签打开会保留原 SQL 草稿；载入当前页签会替换 SQL
      并清除旧结果，可用撤销恢复原 SQL。
    </p>
    <p v-if="sourceChanged" class="m-0 text-xs leading-5 text-g-700">
      <strong class="font-medium">生成期间编辑过的 SQL 草稿已保留。</strong>
      在新页签打开可继续保留草稿；载入当前页签将替换这份草稿。
    </p>
    <p v-if="disabledReason" class="m-0 text-xs leading-5 text-g-700" role="status">
      {{ disabledReason }}
    </p>
    <p v-else-if="newTabDisabledReason" class="m-0 text-xs leading-5 text-g-700" role="status">{{
      newTabDisabledReason
    }}</p>
    <div class="flex flex-wrap items-center gap-2 [&>.el-button]:m-0!">
      <ElButton
        type="primary"
        size="small"
        :disabled="Boolean(disabledReason || newTabDisabledReason || applying)"
        :loading="applying === 'new'"
        @click="emit('open-query')"
      >
        <ArtSvgIcon icon="ri:file-add-line" class="size-4!" aria-hidden="true" />在新页签打开
      </ElButton>
      <ElButton
        size="small"
        :disabled="Boolean(disabledReason || applying)"
        :loading="applying === 'current'"
        @click="emit('apply-current')"
      >
        载入当前页签
      </ElButton>
    </div>
  </section>
</template>

<script setup lang="ts">
  import PlanCodePreview from './plan-code-preview.vue'

  interface Props {
    sql: string
    summary?: string
    warnings?: readonly string[]
    model?: string
    sourceChanged: boolean
    disabledReason?: string
    newTabDisabledReason?: string
    applying?: 'current' | 'new' | null
  }

  withDefaults(defineProps<Props>(), {
    summary: '',
    warnings: () => [],
    model: '',
    disabledReason: '',
    newTabDisabledReason: '',
    applying: null
  })
  const emit = defineEmits<{ 'open-query': []; 'apply-current': [] }>()
</script>
