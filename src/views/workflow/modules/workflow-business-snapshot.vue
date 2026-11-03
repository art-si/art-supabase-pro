<template>
  <ArtSectionCard
    class="workflow-business-snapshot"
    title="业务资料"
    :subtitle="snapshotSubtitle"
    :loading="loading"
    :error="error"
    loading-mode="skeleton"
    :skeleton-rows="3"
    :empty="!hasContent"
    empty-title="暂无业务摘要资料"
    :empty-description="
      sourceRoutePath
        ? '当前业务未提供可展示的摘要，可打开业务原单核对资料。'
        : '当前业务未提供可展示的摘要，请联系发起人核对业务资料。'
    "
    aria-label="审批业务资料"
    @retry="emit('retry')"
  >
    <template v-if="sourceRoutePath" #actions>
      <RouterLink
        class="workflow-business-snapshot__source-link art-icon-label"
        :to="sourceRoutePath"
      >
        查看业务原单<ArtSvgIcon icon="ri:arrow-right-up-line" aria-hidden="true" />
      </RouterLink>
    </template>

    <template v-if="snapshot">
      <div v-if="snapshot.warnings.length" class="workflow-business-snapshot__warnings">
        <ElAlert
          v-for="warning in snapshot.warnings"
          :key="warning"
          :title="warning"
          type="warning"
          :closable="false"
          show-icon
        />
      </div>

      <div v-if="snapshot.metrics.length" class="workflow-business-snapshot__metrics">
        <article
          v-for="metric in snapshot.metrics"
          :key="metric.label"
          :class="`is-${metric.tone || 'primary'}`"
        >
          <small>{{ metric.label }}</small>
          <strong :title="`${metric.label}：${metric.value}`">{{ metric.value }}</strong>
        </article>
      </div>

      <ArtDescriptions
        v-if="displayFields.length"
        :data="snapshot"
        :items="displayFields"
        :columns="2"
        :tablet-columns="2"
        :label-width="100"
        empty-text="—"
      />

      <div v-if="snapshot.attachments.length" class="workflow-business-snapshot__attachments">
        <strong>业务附件（{{ snapshot.attachments.length }}）</strong>
        <a
          v-for="attachment in snapshot.attachments"
          :key="`${attachment.name}-${attachment.url}`"
          :href="attachment.url"
          :title="attachment.name"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ArtSvgIcon icon="ri:attachment-2" aria-hidden="true" />
          <span>{{ attachment.name }}</span>
          <small>{{ attachment.fileSize || attachment.fileType || '' }}</small>
        </a>
      </div>

      <OcrOriginalText
        v-if="snapshot.ocrEvidence"
        :text="snapshot.ocrEvidence.rawText"
        title="原始识别内容"
        description="审批依据：此内容由 OCR 在业务表单人工修正前生成并留存。"
        :rows="6"
      />
    </template>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import OcrOriginalText from '@/components/business/ocr-original-text/index.vue'
  import {
    getWorkflowBusinessContract,
    getWorkflowBusinessSourcePath
  } from './workflow-business-contracts'

  defineOptions({ name: 'WorkflowBusinessSnapshot' })

  const props = withDefaults(
    defineProps<{
      snapshot?: Api.Workflow.WorkflowBusinessSnapshot | null
      loading?: boolean
      error?: Error | null
    }>(),
    { snapshot: null, loading: false, error: null }
  )
  const emit = defineEmits<{ retry: [] }>()

  const sourceRoutePath = computed(() =>
    props.snapshot
      ? getWorkflowBusinessSourcePath(
          props.snapshot.businessType,
          props.snapshot.businessId,
          props.snapshot.routePath
        )
      : ''
  )
  const businessContract = computed(() =>
    getWorkflowBusinessContract(props.snapshot?.businessType || 'generic')
  )
  const hasContent = computed(() =>
    Boolean(
      props.snapshot?.fields.length ||
      props.snapshot?.metrics.length ||
      props.snapshot?.warnings.length ||
      props.snapshot?.attachments.length ||
      props.snapshot?.ocrEvidence?.rawText
    )
  )
  const snapshotSubtitle = computed(() => {
    if (!props.snapshot) return '核对业务原单与审批依据'
    const parts = [businessContract.value.label]
    if (props.snapshot.businessNo) parts.push(props.snapshot.businessNo)
    else if (props.snapshot.subtitle && props.snapshot.subtitle !== props.snapshot.title) {
      parts.push(props.snapshot.subtitle)
    }
    return parts.join(' · ')
  })
  const displayFields = computed<ArtDescriptionItem<Api.Workflow.WorkflowBusinessSnapshot>[]>(() =>
    (props.snapshot?.fields || []).map((field, index) => {
      const metadata = businessContract.value.fields.find(
        (item) => item.key === field.label || item.label === field.label
      )
      const value = normalizeFieldValue(field.value)
      return {
        key: `${metadata?.key || field.label}-${index}`,
        label: metadata?.label || normalizeFieldLabel(field.label, index),
        value: metadata?.referenceType && isUuid(value) ? '已关联，可查看业务原单' : value || '—',
        dictCode: metadata?.dictCode,
        dictDisplay: 'text'
      }
    })
  )

  function normalizeFieldValue(value: string): string {
    const normalized = String(value ?? '').trim()
    if (!normalized) return ''
    try {
      const parsed = JSON.parse(normalized) as unknown
      if (parsed === null || parsed === undefined) return ''
      if (typeof parsed === 'string' || typeof parsed === 'number') return String(parsed)
      if (typeof parsed === 'boolean') return parsed ? '是' : '否'
      if (Array.isArray(parsed)) return parsed.length ? `${parsed.length} 项` : '—'
      return '已提供'
    } catch {
      return normalized
    }
  }

  function normalizeFieldLabel(label: string, index: number): string {
    const normalized = label.trim()
    if (!normalized || /^[a-z][a-zA-Z0-9]*$/.test(normalized)) return `业务字段 ${index + 1}`
    return normalized.replace(/ID$/i, '')
  }

  function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  }
</script>

<style scoped lang="scss">
  .workflow-business-snapshot {
    min-width: 0;

    :deep(.art-section-card__body) {
      display: grid;
      gap: 14px;
    }

    &__warnings {
      display: grid;
      gap: 8px;
    }

    &__source-link {
      display: inline-flex;
      flex: none;
      gap: var(--art-control-icon-gap);
      align-items: center;
      padding: 5px 7px;
      font-size: 13px;
      color: var(--theme-color);
      text-decoration: none;
      border-radius: var(--el-border-radius-small);
      transition:
        color 0.18s ease,
        background-color 0.18s ease,
        box-shadow 0.18s ease;

      &:hover,
      &:focus-visible {
        background: color-mix(in srgb, var(--theme-color) 8%, transparent);
      }

      &:focus-visible {
        outline: none;
        box-shadow: var(--art-themed-action-focus-shadow);
      }
    }

    &__metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;

      article {
        display: grid;
        gap: 5px;
        min-width: 0;
        padding: 11px 12px;
        background: var(--el-bg-color);
        border-left: 3px solid var(--el-color-primary);
        border-radius: var(--el-border-radius-base);

        &.is-success {
          border-left-color: var(--el-color-success);
        }

        &.is-warning {
          border-left-color: var(--el-color-warning);
        }

        &.is-danger {
          border-left-color: var(--el-color-danger);
        }

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--el-text-color-primary);
          white-space: nowrap;
        }
      }
    }

    &__attachments {
      display: grid;
      gap: 8px;

      > strong {
        font-size: 13px;
      }

      a {
        display: flex;
        gap: 8px;
        align-items: center;
        min-width: 0;
        padding: 9px 10px;
        color: var(--el-color-primary);
        background: var(--el-bg-color);
        border: 1px solid transparent;
        border-radius: var(--el-border-radius-base);
        transition:
          background-color 0.18s ease,
          border-color 0.18s ease,
          box-shadow 0.18s ease;

        &:hover,
        &:focus-visible {
          background: color-mix(in srgb, var(--theme-color) 6%, var(--el-bg-color));
          border-color: color-mix(in srgb, var(--theme-color) 18%, transparent);
        }

        &:focus-visible {
          outline: none;
          box-shadow: var(--art-themed-action-focus-shadow);
        }

        span {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    }
  }
</style>
