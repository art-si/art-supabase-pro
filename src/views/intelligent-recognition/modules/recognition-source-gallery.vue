<template>
  <div
    class="recognition-source-gallery"
    :class="{ 'is-compact': compact, 'is-empty': !urls.length }"
  >
    <template v-if="urls.length">
      <div class="recognition-source-gallery__images">
        <figure v-for="(url, index) in visibleUrls" :key="url">
          <ElImage
            :src="url"
            :preview-src-list="urls"
            :initial-index="index"
            :preview-teleported="true"
            fit="cover"
            loading="lazy"
            :alt="`第 ${index + 1} 张原始票据`"
          >
            <template #placeholder>
              <span class="recognition-source-gallery__state" aria-label="原始票据加载中">
                <ArtSvgIcon icon="ri:loader-4-line" />
              </span>
            </template>
            <template #error>
              <span
                class="recognition-source-gallery__state is-error"
                aria-label="原始票据加载失败"
              >
                <ArtSvgIcon icon="ri:image-line" />
              </span>
            </template>
          </ElImage>
          <figcaption v-if="!compact">第 {{ index + 1 }} 张</figcaption>
        </figure>
      </div>
      <span v-if="compact" class="recognition-source-gallery__count">{{ urls.length }} 张</span>
    </template>

    <span v-else-if="compact" class="recognition-source-gallery__missing">未留存</span>
    <ArtEmptyState
      v-else
      title="暂无原始票据"
      :description="
        expectedCount
          ? `该任务记录了 ${expectedCount} 张票据，但创建时尚未留存原图地址。`
          : '该识别任务没有可供预览的原图。'
      "
      size="compact"
      :visual-size="64"
    />
  </div>
</template>

<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'

  defineOptions({ name: 'RecognitionSourceGallery' })

  const props = withDefaults(
    defineProps<{
      urls: string[]
      expectedCount?: number
      compact?: boolean
    }>(),
    {
      expectedCount: 0,
      compact: false
    }
  )

  const visibleUrls = computed(() => props.urls.slice(0, props.compact ? 3 : 5))
</script>

<style scoped lang="scss">
  .recognition-source-gallery {
    min-width: 0;

    &__images {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
      gap: 10px;
    }

    figure {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      background: var(--art-gray-50);
      border: 1px solid var(--art-card-border);
      border-radius: var(--el-border-radius-base);
    }

    .el-image {
      display: block;
      width: 100%;
      height: 156px;
      cursor: zoom-in;
    }

    figcaption {
      padding: 7px 9px;
      font-size: 11px;
      line-height: 16px;
      color: var(--el-text-color-secondary);
      text-align: center;
      background: var(--default-box-color);
      border-top: 1px solid var(--art-card-border);
    }

    &__state {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      color: var(--el-text-color-secondary);
      background: var(--art-gray-50);

      .art-svg-icon {
        font-size: 22px;
        animation: source-gallery-spin 1s linear infinite;
      }

      &.is-error {
        color: var(--el-color-danger);

        .art-svg-icon {
          animation: none;
        }
      }
    }

    &.is-compact {
      display: flex;
      gap: 7px;
      align-items: center;

      .recognition-source-gallery__images {
        display: flex;
        gap: 0;
      }

      figure {
        width: 34px;
        height: 34px;
        border-radius: var(--el-border-radius-small);

        + figure {
          margin-left: -7px;
        }
      }

      .el-image {
        width: 34px;
        height: 34px;
      }

      .recognition-source-gallery__count {
        flex: 0 0 auto;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      .recognition-source-gallery__missing {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  @keyframes source-gallery-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (width <= 640px) {
    .recognition-source-gallery {
      &__images {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .el-image {
        height: 132px;
      }
    }
  }
</style>
