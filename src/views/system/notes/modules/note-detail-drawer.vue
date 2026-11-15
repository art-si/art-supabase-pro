<template>
  <ArtDrawer
    ref="drawerRef"
    size="lg"
    :show-footer="false"
    :close-on-press-escape="!previewVisible"
  >
    <div v-if="note" class="note-detail">
      <section class="note-detail__hero art-card-xs">
        <span class="note-detail__icon" aria-hidden="true">
          <ArtSvgIcon icon="ri:quill-pen-line" />
        </span>
        <div class="note-detail__hero-copy">
          <h2>时间轴笔记</h2>
          <p>{{ authorLabel(note) }} · {{ formatWithDayjs(note.createdAt) || '--' }}</p>
        </div>
      </section>

      <ArtSectionCard class="note-detail__section" preserve-content-structure>
        <header class="note-detail__section-head">
          <div>
            <ArtSectionTitle :show-line="false">笔记正文</ArtSectionTitle>
            <p>移动端时间轴中的原始内容</p>
          </div>
          <span>{{ note.contentText.length }} 字</span>
        </header>
        <div class="note-detail__content" v-html="safeContent" />
        <div v-if="previewUrls.length" class="note-detail__images">
          <ElImage
            v-for="(url, index) in previewUrls"
            :key="url"
            class="note-detail__image"
            :src="url"
            :preview-src-list="previewUrls"
            :initial-index="index"
            :show-progress="previewUrls.length > 1"
            :alt="`笔记图片 ${index + 1}`"
            :aria-label="`放大查看第 ${index + 1} 张图片`"
            fit="cover"
            role="button"
            tabindex="0"
            preview-teleported
            hide-on-click-modal
            @keydown.enter.prevent="previewImageFromKeyboard"
            @keydown.space.prevent="previewImageFromKeyboard"
            @show="previewVisible = true"
            @close="previewVisible = false"
          />
        </div>
        <span v-if="loadingImages" class="note-detail__image-status" role="status"
          >正在加载图片</span
        >
        <ElButton v-else-if="imagesUnavailable" type="primary" link @click="loadImages">
          重试加载图片
        </ElButton>
      </ArtSectionCard>

      <ArtSectionCard class="note-detail__section" preserve-content-structure>
        <header class="note-detail__section-head">
          <div>
            <ArtSectionTitle :show-line="false">记录信息</ArtSectionTitle>
            <p>归属、标签与同步时间</p>
          </div>
        </header>
        <dl class="note-detail__facts">
          <div
            ><dt>归属用户</dt><dd>{{ authorLabel(note) }}</dd></div
          >
          <div
            ><dt>用户标识</dt><dd class="note-detail__mono">{{ note.userId }}</dd></div
          >
          <div
            ><dt>标签</dt><dd>{{ note.tags.length ? note.tags.join('、') : '未设置标签' }}</dd></div
          >
          <div
            ><dt>更新时间</dt><dd>{{ formatWithDayjs(note.updatedAt) || '--' }}</dd></div
          >
          <div
            ><dt>图片附件</dt
            ><dd>{{ note.images.length ? `${note.images.length} 张` : '无图片附件' }}</dd></div
          >
        </dl>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import DOMPurify from 'dompurify'
  import { ElImage } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import { fetchNoteImageUrls, getNoteAuthorLabel } from '@/api/notes'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'
  import { formatWithDayjs } from '@/utils/time'

  const drawerRef = ref<ArtDrawerExpose<Api.Notes.NoteItem>>()
  const note = shallowRef<Api.Notes.NoteItem>()
  const signedUrls = shallowRef(new Map<string, string>())
  const loadingImages = ref(false)
  const previewVisible = ref(false)
  const safeContent = computed(() => DOMPurify.sanitize(note.value?.content ?? ''))
  const previewUrls = computed(() =>
    (note.value?.images ?? []).flatMap((path) => {
      const url = signedUrls.value.get(path)
      return url ? [url] : []
    })
  )
  const imagesUnavailable = computed(
    () =>
      !loadingImages.value && (note.value?.images ?? []).some((path) => !signedUrls.value.has(path))
  )
  const authorLabel = (row: Api.Notes.NoteItem): string =>
    getNoteAuthorLabel(row.userId, row.author)

  function previewImageFromKeyboard(event: KeyboardEvent): void {
    if (event.target instanceof HTMLImageElement) event.target.click()
  }

  async function loadImages(): Promise<void> {
    const row = note.value
    if (!row?.images.length || loadingImages.value) return
    const assertScope = createTenantScopeReadGuard()
    loadingImages.value = true
    try {
      const urls = await fetchNoteImageUrls(row.images)
      assertScope()
      if (note.value === row) signedUrls.value = urls
    } catch (error) {
      notifyFriendlyError(error, '图片加载失败，请重试')
    } finally {
      if (note.value === row) loadingImages.value = false
    }
  }

  async function handleOpen(row: Api.Notes.NoteItem): Promise<void> {
    note.value = row
    signedUrls.value = new Map()
    loadingImages.value = false
    await drawerRef.value?.handleOpen(row, {
      title: '笔记详情',
      subtitle: '按时间轴语义查看正文、标签与附件。',
      contentHeight: 'calc(100vh - 126px)',
      scrollbarAlways: true,
      showFooter: false,
      onOpen: loadImages,
      onReset: () => {
        previewVisible.value = false
        note.value = undefined
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .note-detail {
    display: grid;
    gap: 16px;

    &__hero {
      display: flex;
      gap: 14px;
      align-items: center;
      padding: 18px;
    }

    &__icon {
      display: grid;
      flex: 0 0 42px;
      place-items: center;
      width: 42px;
      height: 42px;
      font-size: 20px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--art-control-radius);
    }

    &__hero-copy {
      min-width: 0;
    }

    &__title-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: 18px;
      color: var(--el-text-color-primary);
    }

    &__hero-copy p,
    &__section-head p {
      margin-top: 4px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__section {
      min-width: 0;
    }

    &__section-head {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    &__section-head > span {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__content {
      font-size: 14px;
      line-height: 1.8;
      color: var(--el-text-color-primary);
      overflow-wrap: anywhere;
    }

    &__content :deep(p) {
      margin: 0 0 10px;
    }

    &__content :deep(img) {
      max-width: 100%;
      height: auto;
      max-height: 104px;
      border-radius: var(--art-control-radius);
    }

    &__images {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    &__image {
      width: 128px;
      max-width: 100%;
      height: 96px;
      border-radius: var(--art-control-radius);

      :deep(.el-image__inner:focus-visible) {
        outline: 2px solid var(--el-color-primary);
        outline-offset: -2px;
      }
    }

    &__image-status {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__content :deep(a) {
      color: var(--el-color-primary);
    }

    &__facts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 24px;
      margin: 0;
    }

    &__facts div {
      display: grid;
      grid-template-columns: 78px minmax(0, 1fr);
      gap: 8px;
      padding: 10px 0;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    &__facts dt {
      color: var(--el-text-color-secondary);
    }

    &__facts dd {
      min-width: 0;
      margin: 0;
      color: var(--el-text-color-primary);
      overflow-wrap: anywhere;
    }

    &__mono {
      font-family: var(--el-font-family-monospace);
      font-size: 12px;
    }
  }

  @media (width <= 720px) {
    .note-detail__facts {
      grid-template-columns: 1fr;
    }
  }
</style>
