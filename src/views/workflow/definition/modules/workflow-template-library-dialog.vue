<template>
  <ArtDialog ref="dialogRef">
    <template #header>
      <div class="workflow-template-library__heading">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:apps-2-line" /></span>
        <div>
          <strong>模板库</strong>
          <small>从现有审批业务契约快速创建流程</small>
        </div>
      </div>
    </template>

    <div class="workflow-template-library">
      <nav class="workflow-template-library__categories" aria-label="流程模板分类">
        <button
          v-for="category in categoryOptions"
          :key="category.key"
          type="button"
          :class="{ 'is-active': library.category === category.key }"
          :aria-current="library.category === category.key ? 'true' : undefined"
          @click="library.category = category.key"
        >
          <span>{{ category.label }}</span>
          <small>{{ category.count }}</small>
        </button>
      </nav>

      <section class="workflow-template-library__content">
        <header>
          <div>
            <strong>{{ activeCategoryLabel }}</strong>
            <small>{{ filteredTemplates.length }} 个可用模板</small>
          </div>
          <ElInput
            v-model="library.keyword"
            clearable
            aria-label="搜索流程模板"
            placeholder="搜索模板或业务说明"
          >
            <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
          </ElInput>
        </header>

        <div v-if="filteredTemplates.length" class="workflow-template-library__grid">
          <button
            v-for="template in filteredTemplates"
            :key="template.key"
            type="button"
            class="workflow-template-library__card"
            @click="selectTemplate(template.key)"
          >
            <span :class="`is-${template.tone}`" aria-hidden="true">
              <ArtSvgIcon :icon="template.icon" />
            </span>
            <span class="workflow-template-library__copy">
              <strong>{{ template.name }}</strong>
              <small>{{ template.description }}</small>
              <em>
                {{ template.fieldCount }} 个业务字段 · {{ template.nodeNames.length }} 个审批节点
              </em>
            </span>
            <ArtSvgIcon class="workflow-template-library__arrow" icon="ri:arrow-right-s-line" />
          </button>
        </div>

        <ArtEmptyState
          v-else
          title="没有匹配的模板"
          description="可以清空搜索词，或切换到其他业务分类。"
          size="compact"
          :visual-size="84"
        />
      </section>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { trim } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import {
    workflowTemplateCategories,
    workflowTemplates,
    type WorkflowTemplateCategory
  } from './workflow-templates'

  defineOptions({ name: 'WorkflowTemplateLibraryDialog' })

  const emit = defineEmits<{ select: [templateKey: string] }>()
  const dialogRef = ref<ArtDialogExpose<undefined>>()
  const library = reactive<{ category: WorkflowTemplateCategory; keyword: string }>({
    category: 'all',
    keyword: ''
  })

  const categoryOptions = computed(() =>
    workflowTemplateCategories.map((category) => ({
      ...category,
      count:
        category.key === 'all'
          ? workflowTemplates.length
          : workflowTemplates.filter((template) => template.category === category.key).length
    }))
  )
  const activeCategoryLabel = computed(
    () => categoryOptions.value.find((item) => item.key === library.category)?.label || '全部'
  )
  const filteredTemplates = computed(() => {
    const keyword = trim(library.keyword).toLocaleLowerCase()
    return workflowTemplates.filter((template) => {
      const inCategory = library.category === 'all' || template.category === library.category
      const searchable = `${template.name} ${template.description}`.toLocaleLowerCase()
      return inCategory && (!keyword || searchable.includes(keyword))
    })
  })

  async function selectTemplate(templateKey: string): Promise<void> {
    emit('select', templateKey)
    await dialogRef.value?.handleClose()
  }

  async function handleOpen(): Promise<void> {
    Object.assign(library, { category: 'all', keyword: '' })
    await dialogRef.value?.handleOpen(undefined, {
      title: '模板库',
      size: 'xl',
      contentHeight: 'min(640px, calc(100vh - 180px))',
      showFooter: false,
      scrollbarAlways: true,
      dialogProps: { draggable: false }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .workflow-template-library__heading {
    display: flex;
    gap: var(--art-space-3);
    align-items: center;

    > span {
      display: grid;
      flex: none;
      place-items: center;
      width: 40px;
      height: 40px;
      font-size: 20px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
      border-radius: var(--el-border-radius-base);
    }

    > div {
      display: grid;
      gap: 2px;
    }

    strong {
      font-size: 17px;
      color: var(--art-gray-900);
    }

    small {
      font-size: 12px;
      color: var(--art-gray-600);
    }
  }

  .workflow-template-library {
    display: grid;
    grid-template-columns: 176px minmax(0, 1fr);
    min-height: 100%;
    margin: calc(var(--art-dialog-content-padding) * -1);

    &__categories {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: var(--art-space-4);
      background: var(--art-gray-50);
      border-right: 1px solid var(--art-gray-200);

      button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        min-height: 42px;
        padding: 0 var(--art-space-3);
        color: var(--art-gray-700);
        text-align: left;
        cursor: pointer;
        background: transparent;
        border: 0;
        border-radius: var(--el-border-radius-base);
        transition:
          color var(--art-motion-duration-fast) ease,
          background-color var(--art-motion-duration-fast) ease;

        small {
          font-variant-numeric: tabular-nums;
          color: var(--art-gray-500);
        }

        &:hover,
        &:focus-visible,
        &.is-active {
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
        }

        &:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--theme-color) 45%, transparent);
          outline-offset: 1px;
        }
      }
    }

    &__content {
      min-width: 0;
      padding: var(--art-space-5);

      > header {
        display: flex;
        gap: var(--art-space-4);
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--art-space-4);

        > div {
          display: grid;
          gap: 3px;
        }

        strong {
          color: var(--art-gray-900);
        }

        small {
          font-size: 12px;
          color: var(--art-gray-600);
        }

        .el-input {
          width: min(320px, 48%);
        }
      }
    }

    &__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--art-space-3);
    }

    &__card {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 20px;
      gap: var(--art-space-3);
      align-items: start;
      min-width: 0;
      padding: var(--art-space-4);
      color: inherit;
      text-align: left;
      cursor: pointer;
      background: var(--el-bg-color);
      border: 1px solid var(--art-gray-200);
      border-radius: var(--el-border-radius-base);
      transition:
        border-color var(--art-motion-duration-fast) ease,
        box-shadow var(--art-motion-duration-fast) ease,
        transform var(--art-motion-duration-fast) ease;

      > span:first-child {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        font-size: 20px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
        border-radius: var(--el-border-radius-base);

        &.is-success {
          color: var(--el-color-success);
          background: var(--el-color-success-light-9);
        }

        &.is-warning {
          color: var(--el-color-warning-dark-2);
          background: var(--el-color-warning-light-9);
        }

        &.is-info {
          color: var(--el-color-info);
          background: var(--el-color-info-light-9);
        }
      }

      &:hover,
      &:focus-visible {
        border-color: var(--theme-color);
        transform: translateY(-1px);
      }

      &:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--theme-color) 38%, transparent);
        outline-offset: 2px;
      }
    }

    &__copy {
      display: grid;
      gap: 5px;
      min-width: 0;

      strong {
        color: var(--art-gray-900);
      }

      small {
        display: -webkit-box;
        overflow: hidden;
        -webkit-line-clamp: 2;
        font-size: 12px;
        line-height: 1.55;
        color: var(--art-gray-600);
        -webkit-box-orient: vertical;
      }

      em {
        font-size: 11px;
        font-style: normal;
        color: var(--art-gray-500);
      }
    }

    &__arrow {
      align-self: center;
      color: var(--art-gray-400);
    }
  }

  @media (width <= 780px) {
    .workflow-template-library {
      grid-template-columns: 1fr;

      &__categories {
        flex-flow: row wrap;
        border-right: 0;
        border-bottom: 1px solid var(--art-gray-200);

        button {
          width: auto;
        }
      }

      &__content > header {
        flex-direction: column;
        align-items: stretch;

        .el-input {
          width: 100%;
        }
      }

      &__grid {
        grid-template-columns: 1fr;
      }
    }
  }

  :global(html[data-box-mode='border-mode'] .workflow-template-library__card:hover),
  :global(html[data-box-mode='border-mode'] .workflow-template-library__card:focus-visible) {
    box-shadow: inset 0 0 0 1px var(--theme-color);
  }

  :global(html[data-box-mode='shadow-mode'] .workflow-template-library__card:hover),
  :global(html[data-box-mode='shadow-mode'] .workflow-template-library__card:focus-visible) {
    border-color: transparent;
    box-shadow: var(--art-themed-action-hover-shadow);
  }
</style>
