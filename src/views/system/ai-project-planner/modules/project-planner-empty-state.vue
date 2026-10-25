<template>
  <section v-if="mode === 'initial'" class="ai-planner__empty art-card-xs">
    <ArtEmptyState
      title="让 AI 为项目排出下一步"
      description="综合当前代码结构、Supabase 能力和历史反馈，生成带证据、风险与验收标准的可执行建议。"
    >
      <div class="ai-planner__empty-actions">
        <div class="ai-planner__empty-badges">
          <span class="art-icon-label"><ArtSvgIcon icon="ri:shield-check-line" />只读分析</span>
          <span class="art-icon-label"
            ><ArtSvgIcon icon="ri:file-copy-2-line" />一键复制 Prompt</span
          >
          <span class="art-icon-label"><ArtSvgIcon icon="ri:history-line" />反馈持续优化</span>
        </div>
        <ElButton
          type="primary"
          size="large"
          :loading="generating"
          :disabled="generationDisabled"
          @click="emit('generate')"
        >
          <ArtSvgIcon icon="ri:sparkling-2-line" />生成第一批项目建议
        </ElButton>
      </div>
    </ArtEmptyState>

    <div class="ai-planner__empty-flow" aria-label="AI 项目规划流程">
      <article>
        <span>01</span>
        <div>
          <strong>读取项目现状</strong>
          <p>识别代码结构、现有能力和运行边界</p>
        </div>
      </article>
      <article>
        <span>02</span>
        <div>
          <strong>评估机会优先级</strong>
          <p>综合影响、投入、风险和置信度排序</p>
        </div>
      </article>
      <article>
        <span>03</span>
        <div>
          <strong>交付执行 Prompt</strong>
          <p>输出可直接交给 Codex 的任务与验收标准</p>
        </div>
      </article>
    </div>
  </section>

  <ArtEmptyState
    v-else
    class="ai-planner__filtered-empty art-card-xs"
    title="没有符合当前筛选条件的建议"
    description="可以调整关键词、批次或能力类别，或者清除全部筛选条件。"
    :visual-size="72"
    size="compact"
  >
    <ElButton type="primary" plain @click="emit('reset-filters')">
      <ArtSvgIcon icon="ri:filter-off-line" />清除筛选
    </ElButton>
  </ArtEmptyState>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  defineProps<{
    mode: 'initial' | 'filtered'
    generating?: boolean
    generationDisabled?: boolean
  }>()

  const emit = defineEmits<{
    generate: []
    'reset-filters': []
  }>()
</script>

<style scoped lang="scss">
  .ai-planner {
    &__empty {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
      gap: 34px;
      align-items: center;
      min-height: 300px;
      padding: 30px 34px;
      background: var(--default-box-color);
    }

    &__empty-actions {
      display: grid;
      gap: var(--art-space-4);
      justify-items: center;
    }

    &__empty-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;

      span {
        display: inline-flex;
        gap: 5px;
        align-items: center;
        padding: 5px 9px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        background: color-mix(in srgb, var(--default-box-color) 92%, var(--el-color-primary));
        border: 1px solid var(--el-border-color-lighter);
        border-radius: 999px;

        :deep(svg) {
          width: 14px;
          height: 14px;
          color: var(--el-color-primary);
        }
      }
    }

    &__empty-flow {
      display: grid;
      gap: 10px;

      article {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        min-width: 0;
        padding: 14px 15px;
        background: color-mix(in srgb, var(--default-box-color) 96%, var(--el-color-primary));
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-base);

        > span {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          font-size: 11px;
          font-weight: 700;
          color: var(--el-color-primary);
          background: var(--el-color-primary-light-9);
          border-radius: 50%;
        }

        strong {
          display: block;
          margin-bottom: 3px;
          color: var(--el-text-color-primary);
        }

        p {
          margin: 0;
          font-size: 12px;
          line-height: 1.55;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__filtered-empty {
      min-height: 150px;
    }
  }

  @media (width <= 1100px) {
    .ai-planner__empty {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (width <= 680px) {
    .ai-planner {
      &__empty {
        padding: 24px 20px;
      }

      &__empty-badges {
        justify-content: center;
      }
    }
  }
</style>
